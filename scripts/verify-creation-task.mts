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
const latestIndex=original.messages.findLastIndex((m:any)=>m.role==='user');
const latest=original.messages[latestIndex];
const earlierMessages=original.messages.slice(0,latestIndex);
const priorReportIds=new Set(earlierMessages.map((m:any)=>m.reportId).filter(Boolean));
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
    s.sources=original.sources;s.messages=earlierMessages;s.reports=original.reports.filter((r:any)=>priorReportIds.has(r.id));
    s.directions=original.directions;s.constraints=original.constraints;
  });
  const run=beginCreationRun('isolated-live-test',session.id,{message:latest.content});
  try {
    await runCreationTurn('isolated-live-test',session.id,run.session.run!.id,run.controller.signal,(event,data)=>{
      if(event==='step') console.log(JSON.stringify(data));
    });
  } finally {run.release();}
  const result=store.readCreationSession('isolated-live-test',session.id)!;
  const report=result.reports.find(r=>r.runId===run.session.run!.id);
  const output={verifiedAt:new Date().toISOString(),status:result.run?.status,error:result.run?.error,
    task:result.run?.task,steps:result.run?.steps,sources:result.sources.map(s=>({id:s.id,name:s.name,characters:s.text.length})),
    report,reply:result.messages.at(-1)?.content};
  const destination=join(cwd,'docs/verification/creation-task-live.json');
  writeFileSync(destination,JSON.stringify(output,null,2));
  assert.equal(result.run?.status,'complete');
  assert.equal(report?.task?.focus,'big_concept');
  assert.ok(report?.searches?.length,'method analysis should retrieve knowledge');
  assert.ok(report?.knowledge.length,'report should cite retrieved methods');
  const target=result.sources.find(s=>s.id===report?.sourceId);
  assert.ok(target?.text.includes('深圳'));
  assert.ok(target?.text.endsWith('“我去。”'));
  assert.ok(!target?.text.includes('帮我拆解'));
  assert.ok(report?.findings.some(f=>f.evidence.some(e=>/我去|深圳|调任/.test(e.quote))));
  console.log('Live new-chapter reproduction passed; evidence: '+destination);
} finally {closeDb?.();process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
