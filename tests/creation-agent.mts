import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cwd=process.cwd();const tmp=mkdtempSync(join(tmpdir(),'creation-test-'));process.chdir(tmp);
try {
  const {getDb,closeDb}=await import('../src/lib/db/index.ts');
  const store=await import('../src/lib/creation/store.ts');
  const {beginCreationRun,stopCreationRun}=await import('../src/lib/creation/runs.ts');
  const {runCreationTurn,validateReportEvidence}=await import('../src/lib/creation/agent.ts');
  const {resolveDirectionCommand}=await import('../src/lib/creation/commands.ts');
  const s=store.createCreationSession('a',{message:'分析人设并给二创方向。结局不复合。',files:[{name:'例文',text:'她隐瞒了项目账本。\n\n主管以为只有自己知道真相。'}]});
  assert.equal(store.readCreationSession('b',s.id),null);
  assert.throws(()=>store.directionAction('b',s.id,'save','x'),/不存在/);
  assert.throws(()=>store.createCreationSession('a',{message:'x',files:[{name:'big',text:'文'.repeat(30001)}]}),/30000/);
  const before=store.readCreationSession('a',s.id)!.sources.length;
  assert.throws(()=>store.mutateCreationSession('a',s.id,current=>store.addCreationSources(current,[{name:'too-big',text:'文'.repeat(30001)}])));
  assert.equal(store.readCreationSession('a',s.id)!.sources.length,before,'invalid sources roll back');
  const sourceId=s.sources[0].id;
  const finding={title:'认知差',observation:'她保留账本',mechanism:'使权力关系可能反转',evidence:[{sourceId,paragraph:1,quote:'她隐瞒了项目账本。'}],knowledgeIds:['k1']};
  const report={scope:'人设',findings:[finding],limitations:['未提供结局']};
  const citation={id:'k1',title:'信息差',source:'method.md#L1',version:'v1',text:'观察不同人物知道什么。'};
  assert.throws(()=>validateReportEvidence({...report,findings:[{...finding,evidence:[{sourceId,paragraph:2,quote:'她隐瞒了项目账本。'}]}]},s,[citation]),/引用校验/);
  assert.throws(()=>validateReportEvidence(report,s,[]),/方法引用/);
  assert.throws(()=>validateReportEvidence(report,s,[citation],{sourceId,start:2,end:2}),/范围/);
  let plan=0;
  const candidate={title:'账本的另一页',premise:'新员工公开算法审计',characters:'员工与团队',conflict:'共同署名被剥夺',informationGap:'主角知道备份',emotionalGoal:'独立',mechanism:'认知差改变权力',changes:'从家庭隐瞒改为集体署名决策',assumptions:['虚构项目'],risks:['证据取得需成立']};
  const run=beginCreationRun('a',s.id,{});
  assert.throws(()=>beginCreationRun('a',s.id,{}),/正在执行/);
  await runCreationTurn('a',s.id,run.session.run!.id,run.controller.signal,()=>{}, {searchKnowledge:()=>[citation],callModel:async(_sys,input,feature)=>{
    if(feature==='creation-task') return {kind:'analysis',knowledgeQuery:null,focus:'characters',instruction:'分析人设并给二创方向，结局不复合',targets:[{kind:'existing',sourceId}]};
    if(feature==='creation-plan') return [ {action:'search_knowledge',query:'信息差'}, {action:'analyze',sourceId,focus:'characters'}, {action:'directions',instruction:'二创'}, {action:'finish',message:'可继续比较方向',waiting:false} ][plan++];
    if(feature==='creation-analysis') return report;
    if(feature==='creation-directions') return {directions:[candidate,{...candidate,title:'署名权'}]};
    if(feature==='creation-check') return {passed:true,issues:[]};
    throw new Error(feature);
  }});run.release();
  let current=store.readCreationSession('a',s.id)!;
  assert.equal(current.run!.status,'complete');assert.equal(current.reports.length,1);assert.equal(current.directions.length,2);
  assert.equal(current.messages.filter(m=>m.directionIds?.length).length,1,'direction cards survive finish');
  assert.throws(()=>beginCreationRun('a',s.id,{}),/已经执行/);
  assert.equal(resolveDirectionCommand(current,'选择第二个方向')?.directionId,current.directions[1].id);
  assert.equal(resolveDirectionCommand(current,'她说“选择第二个方向”'),null);
  const chosen=current.directions[1].id;
  const selectRun=beginCreationRun('a',s.id,{message:'选择第二个方向并保存'});
  await runCreationTurn('a',s.id,selectRun.session.run!.id,selectRun.controller.signal,()=>{}, {callModel:async()=>{throw new Error('selection must not call model');}});selectRun.release();
  current=store.readCreationSession('a',s.id)!;
  assert.equal(current.selectedDirectionId,chosen);assert.deepEqual(current.savedDirectionIds,[chosen]);
  const handoff=store.handoffCreationDirection('a',s.id,chosen);
  store.handoffCreationDirection('a',s.id,chosen);
  const works=JSON.parse((getDb().prepare('SELECT data FROM writing_documents WHERE key=?').get('u:a:works') as {data:string}).data);
  assert.equal(works.length,1);assert.ok(works[0].documents.outline.includes('结局不复合'));assert.equal(works[0].id,handoff.workId);
  assert.throws(()=>store.handoffCreationDirection('b',s.id,chosen),/不存在/);
  // Revising an older direction must use its report, not the newest unrelated report.
  store.mutateCreationSession('a',s.id,c=>c.reports.push({...c.reports[0],id:'unrelated',scope:'另一篇'}));
  let revisionPlan=0;
  const revision=beginCreationRun('a',s.id,{message:'调整第二个方向，让女主更主动'});
  await runCreationTurn('a',s.id,revision.session.run!.id,revision.controller.signal,()=>{}, {callModel:async(_sys,input,feature)=>{
    if(feature==='creation-task') return {kind:'other'};
    if(feature==='creation-plan') return revisionPlan++===0?{action:'directions',instruction:'调整',parentId:chosen}:{action:'finish',message:'新版本已提供',waiting:false};
    if(feature==='creation-directions'){assert.equal((input as any).report.id,current.directions[1].reportId);return {directions:[candidate]};}
    return {passed:true,issues:[]};
  }});revision.release();
  current=store.readCreationSession('a',s.id)!;assert.equal(current.directions.at(-1)!.version,2);assert.equal(current.directions.at(-1)!.reportId,current.directions[1].reportId);assert.equal(current.selectedDirectionId,chosen,'new version does not silently replace selected');
  // Stop fences any delayed provider completion from writing artifacts.
  const stopped=beginCreationRun('a',s.id,{message:'继续分析'});
  await runCreationTurn('a',s.id,stopped.session.run!.id,stopped.controller.signal,()=>{}, {callModel:async()=>{stopCreationRun('a',s.id);return {action:'finish',message:'late',waiting:false};}});stopped.release();
  assert.equal(store.readCreationSession('a',s.id)!.run!.status,'stopped');assert.ok(!store.readCreationSession('a',s.id)!.messages.some(m=>m.content==='late'));
  // Stale persistent run is recoverable even without a process-local abort controller.
  store.mutateCreationSession('a',s.id,c=>{c.run!.status='running';c.run!.startedAt='2000-01-01T00:00:00Z';});
  assert.equal(store.readCreationSession('a',s.id)!.run!.status,'failed');
  closeDb();console.log('creation agent: isolation, atomic updates, limits, evidence, tool loop, direction versions, natural selection, handoff idempotency, stop fencing, stale recovery passed');
}finally{process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
