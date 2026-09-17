/** Explicit, opt-in live reproduction. Reads the selected local session, writes only an isolated DB. */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cwd=process.cwd();
const sessionId=process.env.INKSIGHT_CREATION_SMOKE_SESSION;
if(!sessionId) throw new Error('Set INKSIGHT_CREATION_SMOKE_SESSION to opt in to a live model call.');
const originalDb=new Database(join(cwd,'data/inksight.db'),{readonly:true});
const row=originalDb.prepare('SELECT data FROM creation_sessions WHERE id=?').get(sessionId) as {data:string}|undefined;
if(!row) throw new Error('Session not found');
const original=JSON.parse(row.data);
const model=originalDb.prepare('SELECT * FROM ai_models WHERE id=?').get(original.modelId) as Record<string,unknown>;
originalDb.close();
if(!model) throw new Error('Selected model missing');
const selected=original.directions[0];
const chapterReport=[...original.reports].reverse().find((r:any)=>r.task?.focus==='big_concept' && r.sourceId!==original.reports[0].findings[0].evidence[0].sourceId);
if(!selected || !chapterReport) throw new Error('Need original direction and a later chapter report');
const tmp=mkdtempSync(join(tmpdir(),'creation-live-'));
process.chdir(tmp);
let closeDb:(()=>void)|undefined;
try {
  mkdirSync(join(tmp,'data'),{recursive:true});
  copyFileSync(join(cwd,'data/creation-knowledge.json'),join(tmp,'data/creation-knowledge.json'));
  const db=await import('../src/lib/db/index.ts');closeDb=db.closeDb;
  const columns=Object.keys(model);
  db.getDb().prepare(`INSERT INTO ai_models (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(model));
  const store=await import('../src/lib/creation/store.ts');
  const {beginCreationRun}=await import('../src/lib/creation/runs.ts');
  const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
  const session=store.createCreationSession('isolated-live-test',{message:'test',modelId:original.modelId});
  store.mutateCreationSession('isolated-live-test',session.id,s=>{
    s.sources=original.sources;s.messages=original.messages;s.reports=original.reports;
    s.directions=original.directions;s.constraints=original.constraints;
    s.selectedDirectionId=selected.id;s.focusedDirectionId=selected.id;
    store.addCreationSources(s,[{name:'测试用无关科幻片段',text:'飞船离开木星轨道，返回基地。'}]);
    const src=s.sources.at(-1)!;
    for(let i=0;i<4;i++) s.reports.push({id:'distractor-'+i,scope:'科幻轨道分析',coverage:src.name,sourceId:src.id,findings:[],limitations:[],knowledge:[]});
  });
  const run=beginCreationRun('isolated-live-test',session.id,{message:'结合之前导语的背景、冲突、钩子，以及后来第一章的大概念，讨论当前已选方向第一章应该实现什么结构功能，给出针对这个方向的具体修改建议；暂不生成新方向。保持女主主动性，不要靠男二解决问题。'});
  try {
    await runCreationTurn('isolated-live-test',session.id,run.session.run!.id,run.controller.signal,(event,data)=>{
      if(event==='step') console.log(JSON.stringify(data));
    });
  } finally {run.release();}
  const result=store.readCreationSession('isolated-live-test',session.id)!;
  const output={verifiedAt:new Date().toISOString(),status:result.run?.status,error:result.run?.error,
    context:result.run?.context,steps:result.run?.steps,memory:result.workingMemory,
    expectedReports:[selected.reportId,chapterReport.id],selectedDirection:selected.title,
    reply:result.messages.at(-1)?.content};
  const destination=join(cwd,'docs/verification/creation-memory-live.json');
  writeFileSync(destination,JSON.stringify(output,null,2));
  assert.equal(result.run?.status,'complete');
  assert.ok(result.run?.context?.reportIds.includes(selected.reportId),'missing original guide analysis');
  assert.ok(result.run?.context?.reportIds.includes(chapterReport.id),'missing later chapter analysis');
  assert.ok(!result.run?.context?.reportIds.some(id=>id.startsWith('distractor')),'irrelevant reports leaked');
  assert.equal(result.directions.length,original.directions.length,'discussion should not create a new direction');
  assert.equal(result.selectedDirectionId,selected.id);
  assert.ok(result.workingMemory?.decisions.some(d=>d.quote.includes('男二')),'explicit constraint should persist');
  assert.ok(result.messages.at(-1)?.context);
  console.log('Live combined-context discussion passed; evidence: '+destination);
} finally {closeDb?.();process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
