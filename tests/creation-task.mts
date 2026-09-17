import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cwd=process.cwd();const tmp=mkdtempSync(join(tmpdir(),'creation-task-'));process.chdir(tmp);
try {
  const {closeDb}=await import('../src/lib/db/index.ts');
  const store=await import('../src/lib/creation/store.ts');
  const {beginCreationRun}=await import('../src/lib/creation/runs.ts');
  const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
  const {bindAnalysisTask}=await import('../src/lib/creation/task.ts');
  const oldText='中秋团圆饭前，妹妹突然说要给我编头发。\n养了七年的长发，瞬间被齐根剪断。\n可这一次，我不想再陪他们玩了。';
  const newText='妹妹林苗苗笑够了，捡起地上的一截头发。\n她把照片发进家族群，所有人都在笑。\n\n领导问我是否接受深圳调任，今晚十二点前还能改。\n我低下头，回复了两个字。\n“我去。”';
  const request=newText+'\n\n帮我拆解一下这一章的大概念';
  const citation={id:'method-four',title:'每章必须提取的四层',source:'大概念提取.md#L33',version:'v1',text:'检查主角是否从依附转为自救。'};
  const unused={...citation,id:'method-unused',title:'提取流程'};
  function setup(){
    const s=store.createCreationSession('test',{message:'分析这个导语的背景、冲突、钩子，并给仿写建议',files:[{name:'旧导语',text:oldText}]});
    store.mutateCreationSession('test',s.id,c=>c.reports.push({id:'old-report',scope:'导语三维度',coverage:'旧导语',findings:[],limitations:[],knowledge:[]}));
    return s;
  }
  const pastedPlan={kind:'analysis' as const,knowledgeQuery:null,focus:'big_concept' as const,instruction:'仅拆解新章节的大概念',targets:[{kind:'pasted' as const,name:'中秋剪发第一章',startQuote:'妹妹林苗苗笑够了',endQuote:'“我去。”'}]};
  const s=setup();const run=beginCreationRun('test',s.id,{message:request});
  let plans=0,analyses=0;const observed:any[]=[];
  await runCreationTurn('test',s.id,run.session.run!.id,run.controller.signal,()=>{}, {
    searchKnowledge:(query,limit)=>{assert.equal(query,'大概念 状态升级');assert.equal(limit,5);return [citation,unused];},
    callModel:async(_sys,input:any,feature)=>{
      if(feature==='creation-task'){assert.equal(input.latestMessage.content,request);return {...pastedPlan,knowledgeQuery:'大概念 状态升级'};}
      if(feature==='creation-plan') {
        observed.push(...input.observed);
        assert.equal(input.currentTask.focus,'big_concept');
        const target=input.currentTask.sourceIds[0];
        return [
          {action:'finish',message:'旧报告已经完成了分析',waiting:false},
          {action:'analyze',sourceId:s.sources[0].id,focus:'full'},
          {action:'analyze',sourceId:target,focus:'big_concept'},
          {action:'finish',message:'主角接受调任，开始实际离开旧关系。',waiting:false},
        ][plans++];
      }
      if(feature==='creation-analysis') {
        analyses++;assert.equal(input.focus,'big_concept');assert.equal(input.request.endsWith('帮我拆解一下这一章的大概念'),true);
        assert.equal(input.paragraphs.map((p:any)=>p.text).join('\n\n'),newText);
        assert.equal(input.paragraphs.some((p:any)=>p.text.includes('养了七年')),false);
        assert.equal(input.knowledge.length,2);
        return {scope:'新章节大概念',findings:[{title:'从觉醒到自救行动',observation:'主角接受调任',mechanism:'外部机会变成实际退出旧关系的行动',evidence:[{sourceId:input.sourceId,paragraph:2,quote:'“我去。”'}],knowledgeIds:[citation.id]}],limitations:['未检索到相关知识库','尚未提供调任之后的章节']};
      }
      throw new Error(feature);
    },
  });run.release();
  let current=store.readCreationSession('test',s.id)!;
  assert.equal(current.run!.status,'complete');assert.equal(analyses,1,'wrong source rejected before model analysis');
  assert.ok(observed.some(o=>o.tool==='completion_check'));assert.ok(observed.some(o=>o.result?.error?.includes('分析对象或维度')));
  assert.equal(current.sources.length,2);assert.equal(current.sources[1].text,newText);
  const report=current.reports.at(-1)!;
  assert.equal(report.sourceId,current.sources[1].id);assert.equal(report.sourceVersion,current.sources[1].version);
  assert.equal(report.task?.messageId,current.messages.filter(m=>m.role==='user').at(-1)!.id);
  assert.equal(report.searches?.[0].query,'大概念 状态升级');assert.equal(report.searches?.[0].results.length,2);assert.equal(report.knowledge.length,1);
  assert.ok(!report.limitations.some(l=>l.includes('未检索到')));
  assert.ok(!current.messages.some(m=>m.content==='旧报告已经完成了分析'));
  // Later runs do not erase a report's retrieval snapshot; explicit old-source requests work.
  const next=beginCreationRun('test',s.id,{message:'现在只分析之前那段旧导语的冲突，不分析新章节'});
  let n=0;
  await runCreationTurn('test',s.id,next.session.run!.id,next.controller.signal,()=>{}, {callModel:async(_sys,input:any,feature)=>{
    if(feature==='creation-task') return {kind:'analysis',knowledgeQuery:null,focus:'plot',instruction:'只分析旧导语冲突',targets:[{kind:'existing',sourceId:s.sources[0].id}]};
    if(feature==='creation-plan') return n++===0?{action:'analyze',sourceId:s.sources[0].id,focus:'plot'}:{action:'finish',message:'旧导语冲突已分析',waiting:false};
    assert.equal(input.sourceId,s.sources[0].id);assert.deepEqual(input.knowledge,[]);
    return {scope:'旧导语冲突',findings:[{title:'冲突',observation:'剪发',mechanism:'信任背叛',evidence:[{sourceId:s.sources[0].id,paragraph:1,quote:'养了七年的长发'}],knowledgeIds:[]}],limitations:['知识库不存在']};
  }});next.release();
  current=store.readCreationSession('test',s.id)!;
  assert.equal(current.run!.status,'complete');assert.equal(current.reports[1].searches?.[0].results.length,2);
  assert.deepEqual(current.reports.at(-1)!.searches,[]);
  assert.ok(current.reports.at(-1)!.limitations.includes('本次拆解仅依据所提供原文，未使用知识库方法引用。'));
  // Fabricated or ambiguous boundaries fail atomically instead of falling back to an old text.
  const invalid=setup();
  const invalidRun=beginCreationRun('test',invalid.id,{message:request});
  await runCreationTurn('test',invalid.id,invalidRun.session.run!.id,invalidRun.controller.signal,()=>{}, {callModel:async()=>({...pastedPlan,targets:[{...pastedPlan.targets[0],endQuote:'主角已经到了深圳。'}]})});invalidRun.release();
  assert.equal(store.readCreationSession('test',invalid.id)!.run!.status,'failed');
  assert.equal(store.readCreationSession('test',invalid.id)!.sources.length,1);
  const ambiguous=structuredClone(current);ambiguous.messages.push({id:'ambiguous',role:'user',content:'开始。正文。开始。结束。',createdAt:''});
  assert.throws(()=>bindAnalysisTask(ambiguous,{...pastedPlan,targets:[{kind:'pasted',name:'x',startQuote:'开始。',endQuote:'结束。'}]}),/边界/);
  // An unresolved target must ask, without an analysis or false completion.
  const question=setup();const qRun=beginCreationRun('test',question.id,{message:'帮我分析一下那篇'});
  await runCreationTurn('test',question.id,qRun.session.run!.id,qRun.controller.signal,()=>{}, {callModel:async()=>({kind:'clarify',question:'你指的是哪一篇？'})});qRun.release();
  assert.equal(store.readCreationSession('test',question.id)!.run!.status,'waiting');
  // A full chapter cannot silently become its first paragraph; zero-hit search is recorded.
  const ranged=setup();const rRun=beginCreationRun('test',ranged.id,{message:request});let rPlan=0,rCalls=0;
  await runCreationTurn('test',ranged.id,rRun.session.run!.id,rRun.controller.signal,()=>{}, {
    searchKnowledge:()=>[],callModel:async(_sys,input:any,feature)=>{
      if(feature==='creation-task') return pastedPlan;
      if(feature==='creation-plan') {
        const sourceId=input.currentTask.sourceIds[0];
        return [{action:'analyze',sourceId,focus:'big_concept',startParagraph:1,endParagraph:1},
          {action:'search_knowledge',query:'没有匹配的方法'},
          {action:'analyze',sourceId,focus:'big_concept'},
          {action:'finish',message:'按原文完成',waiting:false}][rPlan++];
      }
      rCalls++;assert.equal(input.paragraphs.length,2);
      return {scope:'章节',findings:[{title:'离开',observation:'接受调任',mechanism:'主动自救',evidence:[{sourceId:input.sourceId,paragraph:2,quote:'“我去。”'}],knowledgeIds:[]}],limitations:[]};
    },
  });rRun.release();
  const rangedResult=store.readCreationSession('test',ranged.id)!;
  assert.equal(rangedResult.run!.status,'complete');assert.equal(rCalls,1);
  assert.deepEqual(rangedResult.reports.at(-1)!.searches?.[0].results,[]);
  closeDb();console.log('creation task: new chapter binding, wrong source/focus guard, stale completion guard, retrieval snapshots, explicit old text, invalid boundaries and clarification passed');
} finally {process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
