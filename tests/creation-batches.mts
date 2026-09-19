import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const cwd=process.cwd(),tmp=mkdtempSync(join(tmpdir(),'creation-batches-'));process.chdir(tmp);
try {
 const {closeDb}=await import('../src/lib/db/index.ts');const store=await import('../src/lib/creation/store.ts');
 const {candidateBatches,resolveDiscussionTarget}=await import('../src/lib/creation/batches.ts');
 const {resolveDirectionCommand}=await import('../src/lib/creation/commands.ts');
 const {contextCatalog}=await import('../src/lib/creation/context.ts');
 const {validateMaterialDirections,historicalMaterialCandidates,validateNoveltyReview,withdrawResourcesSkeleton}=await import('../src/lib/creation/material.ts');
 const {beginCreationRun}=await import('../src/lib/creation/runs.ts');const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
 const s=store.createCreationSession('a',{message:'从素材生成不同故事核',files:[{name:'素材',text:'主角帮助朋友经营小店后被踢走。'}]});
 const material={sources:s.sources.map(src=>({id:src.id,name:src.name,version:src.version})),grouping:'alternatives' as const,value:'利益错位',authorSettings:[],retained:'不公',changed:'因果改变',protagonist:{desire:'独立',obstacle:'资源控制',cost:'失去旧关系'},choices:'拒绝通融，承担关系断裂',frameworks:[{kind:'system' as const,name:'系统建议',knowledgeIds:[],fit:'规则对照',prerequisites:['权力发生交换'],limitations:['需要时间跨度'],tradeoff:'不使用单纯撤回帮助',beats:['过去被拒','现在回绝']}],frameworkStatus:'系统结构建议'};
 const base={familyId:'x',version:1,premise:'过去被拒，现在获得决定权，原样执行规则',characters:'经营者与供应商',conflict:'公平规则与旧交情',informationGap:'双方地位已变',emotionalGoal:'释然',mechanism:'前后决定权交换',changes:'权力交换而非资源撤回',assumptions:[],risks:['变化需合理'],material,knowledgeIds:[],createdAt:''};
 store.mutateCreationSession('a',s.id,c=>{
  c.directions=Array.from({length:9},(_,i)=>({...base,id:'d'+i,familyId:'f'+i,title:['餐馆','主播','技术','夫妻','亲情','旧求助','情侣','最新求助','所有权'][i]}));
  for(let g=0;g<3;g++) c.messages.push({id:'batch'+g,role:'assistant',content:'生成候选',directionIds:[0,1,2].map(i=>'d'+(g*3+i)),createdAt:''});
  c.messages.push({id:'select-old',role:'assistant',content:'已选定旧方向',directionIds:['d1'],createdAt:''});c.selectedDirectionId='d1';c.focusedDirectionId='d1';
 });
 let current=store.readCreationSession('a',s.id)!;
 assert.equal(candidateBatches(current).length,3,'selection cards do not create batches');
 assert.equal(contextCatalog(current).latestCandidateBatchId,'batch2');
 assert.equal(resolveDiscussionTarget(current,'继续聊第二个')?.directionId,'d7');
 assert.equal(resolveDiscussionTarget(current,'继续聊最初一组的第二个')?.directionId,'d1');
 assert.equal(resolveDiscussionTarget(current,'继续聊上一组的第二个')?.directionId,'d4');
 assert.ok(resolveDiscussionTarget(current,'继续聊第五个')?.question);
 assert.equal(resolveDiscussionTarget(current,'她说“继续聊第二个”'),null);
 assert.equal(resolveDirectionCommand(current,'选择第二个方向')?.directionId,'d7');
 const active=beginCreationRun('a',s.id,{message:'继续聊第二个'});let plannerCalls=0;
 await runCreationTurn('a',s.id,active.session.run!.id,active.controller.signal,()=>{}, {callModel:async(_sys,input:any,feature)=>{
  assert.equal(feature,'creation-plan','unambiguous ordinal should not require extra intent call');plannerCalls++;
  assert.deepEqual(input.context.targetDirectionIds,['d7']);assert.equal(input.context.focusedDirectionId,'d7');assert.equal(input.context.selectedDirectionId,'d1');
  return {action:'finish',message:'我们继续聊最新求助方向。',waiting:false};
 }});active.release();current=store.readCreationSession('a',s.id)!;
 assert.equal(current.run!.status,'complete');assert.equal(plannerCalls,1);assert.equal(current.focusedDirectionId,'d7');assert.equal(current.selectedDirectionId,'d1');
 const history=historicalMaterialCandidates(current,[s.sources[0].id]);
 assert.throws(()=>validateMaterialDirections([{...base,title:'新标题',material:{...material,sources:undefined}} as any],current,[],1,history),/重复了历史/);
 const repeatedTitle={...base,premise:'换一种措辞的旧故事',title:current.directions[0].title};
 assert.throws(()=>validateMaterialDirections([repeatedTitle as any],current,[],1,history),/重复了历史/);
 assert.throws(()=>validateNoveltyReview({passed:true,issues:[],comparisons:[]},history,3),/不完整/);
 assert.equal(withdrawResourcesSkeleton({premise:'她停止供货后朋友的供应链断裂',conflict:'身份误判',choices:'她平静退出并停止供货，店铺客源流失'}),true);
 assert.equal(withdrawResourcesSkeleton({premise:'她要求回购份额，对方现金流承压',conflict:'协议履行',choices:'她按约要求支付回购款'}),false);
 const comparisons=[1,2,3].map(candidateIndex=>({candidateIndex,closestPreviousId:'d0',sameCausalSkeleton:false,differences:[{dimension:'choice' as const,detail:'从撤回资源改为协商新规则'},{dimension:'causality' as const,detail:'共同改革而非对方经营崩溃'}]}));
 assert.doesNotThrow(()=>validateNoveltyReview({passed:true,issues:[],comparisons},history,3));
 assert.throws(()=>validateNoveltyReview({passed:true,issues:[],comparisons:comparisons.map(x=>({...x,sameCausalSkeleton:true}))},history,3),/因果骨架/);
 assert.throws(()=>validateNoveltyReview({passed:true,issues:[],comparisons:comparisons.map(x=>({...x,differences:[x.differences[0],x.differences[0]]}))},history,3),/结构维度/);
 closeDb();console.log('creation batches: latest/previous/first group, focus not selection, no extra intent call, historic duplicates and structural review gate passed');
} finally {process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
