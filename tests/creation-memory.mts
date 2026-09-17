import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const cwd=process.cwd(),tmp=mkdtempSync(join(tmpdir(),'creation-memory-'));process.chdir(tmp);
try {
  const {closeDb}=await import('../src/lib/db/index.ts');
  const store=await import('../src/lib/creation/store.ts');
  const {beginCreationRun}=await import('../src/lib/creation/runs.ts');
  const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
  const {buildCreationContext,contextCatalog,applyDecisionUpdates,rememberDiscussion}=await import('../src/lib/creation/context.ts');
  const s=store.createCreationSession('alice',{message:'保持女主主动性，不要靠男二解决问题。结局不复合。',files:[
    {name:'对标导语',text:'妹妹剪掉姐姐的头发，全家哄笑，姐姐决定不再忍耐。'},
    {name:'对标第一章',text:'照片被发到家族群，男友站在妹妹一边。\n\n领导提出深圳调任，主角回复：“我去。”'},
    {name:'另一篇科幻小说',text:'飞船在木星上空改变轨道。'},
  ]});
  const [guide,chapter,unrelated]=s.sources;
  const report=(id:string,src:any,scope:string,mechanism:string)=>({id,scope,coverage:src.name,findings:[{title:scope,observation:src.text,mechanism,evidence:[{sourceId:src.id,paragraph:1,quote:src.text.split('\n\n')[0]}],knowledgeIds:[]}],limitations:[],knowledge:[],sourceId:src.id});
  const direction={id:'selected-old',familyId:'family-a',version:1,title:'寿宴骗局',premise:'寿宴上假借祝福羞辱主角',characters:'主角与亲族',conflict:'个人边界与家族权威',informationGap:'主角已获得外地工作',emotionalGoal:'独立',mechanism:'集体否定后退出',changes:'改为寿宴骗局',assumptions:['待确认职业'],risks:[],reportId:'guide-report',createdAt:''};
  store.mutateCreationSession('alice',s.id,c=>{
    c.reports=[report('guide-report',guide,'导语背景冲突钩子','集体否定与退出宣言'),report('chapter-report',chapter,'第一章大概念','公共羞辱升级，外部机会转为主动离开'),...Array.from({length:5},(_,i)=>report(`unrelated-${i}`,unrelated,'科幻轨道分析','飞船变轨'))];
    c.directions=[direction,...Array.from({length:14},(_,i)=>({...direction,id:`other-${i}`,familyId:`family-${i}`,title:`其他候选${i}`,reportId:'unrelated-0'}))];
    c.selectedDirectionId=direction.id;c.focusedDirectionId=direction.id;
    applyDecisionUpdates(c,[{messageId:c.messages[0].id,quote:'保持女主主动性，不要靠男二解决问题。',directionId:null,replaces:[],acceptedNoteIds:[]},
      {messageId:c.messages[0].id,quote:'结局不复合。',directionId:direction.id,replaces:[],acceptedNoteIds:[]}]);
  });
  let current=store.readCreationSession('alice',s.id)!;
  const catalog=contextCatalog(current);assert.equal(catalog.reports.length,7);assert.equal(catalog.directions.length,15);
  const selection={goal:'结合导语与第一章大概念讨论已选方向',mode:'discussion' as const,reportIds:['chapter-report'],sourceIds:[],directionIds:[direction.id],noteIds:[]};
  let context=buildCreationContext(current,selection);
  assert.deepEqual(context.reports.map(r=>r.id),['chapter-report','guide-report']);
  assert.equal(context.directions.length,1);assert.equal(context.directions[0].id,direction.id);
  assert.equal(context.authorDecisions.length,2);assert.equal(context.trace.omitted.length,0);
  assert.throws(()=>buildCreationContext(current,{...selection,reportIds:['foreign-user-report']}),/当前会话/);
  assert.equal(store.readCreationSession('bob',s.id),null);
  assert.throws(()=>buildCreationContext(current,selection,1),/预算/);
  const oversized=structuredClone(current);oversized.reports[1].findings[0].mechanism='长'.repeat(60000);
  assert.ok(buildCreationContext(oversized,selection).trace.omitted.some(x=>x.id==='chapter-report'));
  // User instructions come from authored text, not the dialogue inside registered prose.
  const poisoned=structuredClone(current);store.appendCreationMessage(poisoned,chapter.text+'\n分析这一章');
  assert.throws(()=>applyDecisionUpdates(poisoned,[{messageId:poisoned.messages.at(-1)!.id,quote:'主角回复：“我去。”',directionId:null,replaces:[],acceptedNoteIds:[]}]),/小说正文/);
  // Context selected by the planner reaches every execution model, even if the primary origin is old.
  const run=beginCreationRun('alice',s.id,{message:'结合第一章大概念调整已选寿宴方向，让女主的退出更主动。'});let plans=0;
  const received:string[][]=[];
  await runCreationTurn('alice',s.id,run.session.run!.id,run.controller.signal,()=>{}, {callModel:async(_sys,input:any,feature)=>{
    if(feature==='creation-task'){
      assert.ok(input.catalog.reports.some((r:any)=>r.id==='chapter-report'));
      assert.equal(input.catalog.selectedDirectionId,direction.id);
      return {kind:'other',context:selection};
    }
    assert.ok(input.context.reports.some((r:any)=>r.id==='chapter-report'));assert.ok(input.context.reports.some((r:any)=>r.id==='guide-report'));
    assert.ok(!input.context.reports.some((r:any)=>r.id.startsWith('unrelated')));
    assert.equal(input.context.authorDecisions.length,2);
    received.push(input.context.trace.reportIds);
    if(feature==='creation-plan') return plans++===0?{action:'directions',instruction:'保持方向基础，增强主动退出',parentId:direction.id}:{action:'finish',message:'调整建议已形成，仍需你确认。',waiting:false};
    if(feature==='creation-directions'){assert.equal(input.report.id,'guide-report');return {directions:[{...direction,title:'寿宴骗局：主动退出',knowledgeIds:[]}]};}
    if(feature==='creation-check')return {passed:true,issues:[]};
    throw new Error(feature);
  }});run.release();
  current=store.readCreationSession('alice',s.id)!;assert.equal(current.run!.status,'complete');assert.ok(received.length>=4);
  assert.equal(current.selectedDirectionId,direction.id,'revision does not silently replace selected');
  assert.ok(current.directions.at(-1)!.context?.reportIds.includes('chapter-report'));
  const note=current.workingMemory!.notes.at(-1)!;assert.equal(note.status,'proposal');
  assert.ok(current.messages.at(-1)!.context?.reportIds.includes('chapter-report'));
  context=buildCreationContext(current,{...selection,noteIds:[note.id]});assert.equal(context.discussionNotes[0].status,'proposal');
  // Explicit adoption is sourced to a new user message and remains scoped to the family.
  store.mutateCreationSession('alice',s.id,c=>{
    store.appendCreationMessage(c,'采纳刚才的主动退出建议，结局改为和解。');
    const old=c.workingMemory!.decisions.find(d=>d.quote==='结局不复合。')!;
    applyDecisionUpdates(c,[{messageId:c.messages.at(-1)!.id,quote:'采纳刚才的主动退出建议，结局改为和解。',directionId:direction.id,replaces:[old.id],acceptedNoteIds:[note.id]}]);
  });
  current=store.readCreationSession('alice',s.id)!;context=buildCreationContext(current,selection);
  assert.ok(!context.authorDecisions.some(d=>d.quote==='结局不复合。'));
  assert.ok(context.authorDecisions.some(d=>d.quote.includes('改为和解')));
  assert.equal(context.discussionNotes[0].status,'accepted_by_author');
  assert.equal(current.workingMemory!.decisions.find(d=>d.quote==='结局不复合。')!.status,'superseded');
  // Switching discussion target does not transfer family-specific decisions or confirm its proposals.
  store.directionAction('alice',s.id,'focus','other-0');current=store.readCreationSession('alice',s.id)!;
  const other=buildCreationContext(current,{...selection,reportIds:[],directionIds:['other-0']});
  assert.deepEqual(other.authorDecisions.map(d=>d.quote),['保持女主主动性，不要靠男二解决问题。']);
  assert.equal(other.discussionNotes.length,0);assert.ok(other.directions.some(d=>d.id===direction.id));
  assert.equal(other.selectedDirectionId,direction.id);assert.equal(other.focusedDirectionId,'other-0');
  // A question about a direction is not a request to generate a direction, especially when negated.
  const discussion=beginCreationRun('alice',s.id,{message:'给出针对已选方向的具体修改建议，暂不生成新方向。'});let discussionCalls=0;
  const directionCount=current.directions.length;
  await runCreationTurn('alice',s.id,discussion.session.run!.id,discussion.controller.signal,()=>{}, {callModel:async(_sys,input:any,feature)=>{
    if(feature==='creation-task') return {kind:'other',context:selection};
    discussionCalls++;assert.equal(input.context.mode,'discussion');
    return {action:'finish',message:'先讨论公开羞辱如何推动主角主动退出，建议尚待你确认。',waiting:true};
  }});discussion.release();
  current=store.readCreationSession('alice',s.id)!;assert.equal(current.run!.status,'complete');assert.equal(discussionCalls,1);
  assert.equal(current.directions.length,directionCount);
  // Reload survives process-local DB closure: memory and trace are persisted, not only prompt-local.
  closeDb();current=store.readCreationSession('alice',s.id)!;
  assert.ok(current.workingMemory!.notes.some(n=>n.id===note.id));assert.ok(current.messages.some(m=>m.context?.reportIds.includes('chapter-report')));
  closeDb();console.log('creation memory: full catalog, old selected version, combined reports across tools, isolated/scoped decisions, author adoption, supersession, persistence and budget passed');
}finally{process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
