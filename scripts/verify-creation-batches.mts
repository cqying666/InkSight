/** Opt-in live regression in an isolated DB; never edits the source conversation. */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const cwd=process.cwd();if(process.env.INKSIGHT_BATCH_LIVE!=='1') throw Error('Set INKSIGHT_BATCH_LIVE=1 to run live checks');
const originalDb=new Database(join(cwd,'data/inksight.db'),{readonly:true});
const originals=(originalDb.prepare('select data from creation_sessions order by updated_at desc').all() as {data:string}[]).map(r=>JSON.parse(r.data));
const original=originals.find(s=>s.messages.some((m:any)=>m.role==='user' && m.content==='你再给我生成三个跟上面不同的吧'));
if(!original)throw Error('Reproduction session missing');
const model=originalDb.prepare('select * from ai_models where id=?').get(original.modelId) as Record<string,unknown>;originalDb.close();
const tmp=mkdtempSync(join(tmpdir(),'creation-batch-live-'));process.chdir(tmp);let close:(()=>void)|undefined;
const caseFilter=process.env.INKSIGHT_BATCH_CASE;
const results:any[]=caseFilter?JSON.parse(readFileSync(join(cwd,'docs/verification/creation-batches-live.json'),'utf8')).results.filter((r:any)=>caseFilter==='wedding'?r.label!=='wedding-analysis':r.label==='wedding-analysis'):[];
try {
 mkdirSync('data');copyFileSync(join(cwd,'data/creation-knowledge.json'),'data/creation-knowledge.json');
 const db=await import('../src/lib/db/index.ts');close=db.closeDb;
 const cols=Object.keys(model);db.getDb().prepare(`insert into ai_models (${cols.join(',')}) values (${cols.map(()=>'?').join(',')})`).run(...Object.values(model));
 const store=await import('../src/lib/creation/store.ts');const {beginCreationRun}=await import('../src/lib/creation/runs.ts');const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
 const session=store.createCreationSession('test',{message:'fixture',modelId:original.modelId});
 const index=original.messages.findIndex((m:any)=>m.role==='user'&&m.content==='你再给我生成三个跟上面不同的吧');
 const messages=original.messages.slice(0,index);const ids=new Set(messages.flatMap((m:any)=>m.directionIds??[]));
 store.mutateCreationSession('test',session.id,s=>{s.messages=messages;s.sources=original.sources;s.directions=original.directions.filter((d:any)=>ids.has(d.id));s.constraints=original.constraints;});
 async function run(id:string,message:string|undefined,label:string) {
  const active=beginCreationRun('test',id,message?{message}:{});const responses:{feature:string;content:string}[]=[];try {await runCreationTurn('test',id,active.session.run!.id,active.controller.signal,(event,data)=>{if(event==='step')console.log(label,JSON.stringify(data));},{onModelResponse:(feature,content)=>{responses.push({feature,content});}});}finally{active.release();}
  const s=store.readCreationSession('test',id)!;results.push({label,responses,status:s.run!.status,error:s.run?.error,steps:s.run?.steps,context:s.run?.context,reply:s.messages.at(-1),directions:s.directions.slice(-3)});
  writeFileSync(join(cwd,'docs/verification/creation-batches-live.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
  assert.equal(s.run!.status,'complete',s.run!.error);return s;
 }
 if(process.env.INKSIGHT_BATCH_CASE!=='wedding') {
 const regenerated=await run(session.id,'你再给我生成三个跟上面不同的吧','regenerate');
 assert.equal(regenerated.directions.length,ids.size+3);assert.equal(regenerated.messages.at(-1)?.noveltyComparisons?.length,3);
 const latestIds=regenerated.messages.at(-1)!.directionIds!;const chosen=latestIds[1];
 const discussion=await run(session.id,'继续聊第二个','discuss-latest-second');
 assert.equal(discussion.focusedDirectionId,chosen);assert.deepEqual(discussion.run!.context?.targetDirectionIds,[chosen]);
 assert.equal(discussion.selectedDirectionId,undefined);assert.equal(discussion.directions.length,regenerated.directions.length);
 }
 if(caseFilter!=='regenerate') {
 const wedding=store.createCreationSession('test',{modelId:original.modelId,message:'新婚当天，儿媳因嫂子占用婚床、触碰民俗忌讳而当场翻脸，家里人却一味偏向怀孕的嫂子。原本热闹的喜事瞬间变成家庭矛盾爆发点，儿媳直接提出回娘家。\n\n请分析素材的人物事件、核心冲突、情绪变化和潜在爆款元素，并生成三个骨架不同的故事方向。婚床忌讳只视为角色观念。'});
 const checked=await run(wedding.id,undefined,'wedding-analysis');
 assert.ok(checked.messages.at(-1)?.materialAnalysis?.appealElements.length);
 assert.equal(checked.directions.length,3);
 }
 console.log('Live batch diversity, latest-second binding and wedding analysis passed.');
} finally {close?.();process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
