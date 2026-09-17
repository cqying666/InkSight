/** Live model smoke in an isolated DB. Copies configuration in memory; never logs credentials. */
import Database from 'better-sqlite3';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cwd=process.cwd();
const db=new Database(join(cwd,'data/inksight.db'),{readonly:true});
const requested=process.env.INKSIGHT_MATERIAL_MODEL;
const model=(requested?db.prepare('SELECT * FROM ai_models WHERE id=?').get(requested):db.prepare('SELECT * FROM ai_models WHERE is_active=1 ORDER BY created_at ASC LIMIT 1').get()) as Record<string,any>|undefined;
db.close();
if(!model) throw new Error('No active model available');
const tmp=mkdtempSync(join(tmpdir(),'creation-material-live-'));process.chdir(tmp);
let closeDb:(()=>void)|undefined;
const results:any[]=[];
const scenarios=[
 {name:'职场',material:'我带了三个月的新人被提拔成了我的主管。他私下承认项目是我做的，却说公开澄清会让整个团队失去下季度预算。我手里保留了过程记录，但项目里的其他同事也确实出了力。',request:'从这段素材提炼三个有实质差别的核心梗，并推荐适配框架。不写婚恋，不把主管写成蠢人，让主角靠自己的选择推进。'},
 {name:'亲情',material:'父亲退休后一直给我送菜，我嫌他不提前打招呼。昨天他第一次没来，我才发现他把送菜路线画在了旧地图上，沿路还会去看几个很久没有联系的朋友。',request:'把这段素材转成三个核心梗与框架，偏克制温暖。不要绝症和突然死亡，不要强造恶人。'},
 {name:'婚恋',material:'我们准备结婚时说好AA制，他计算每一笔婚礼费用，我负责协调双方亲戚和场地。婚礼取消后，他拿出了转账明细要求结算，我才发现自己那些无形的投入从没被记账。',request:'根据这个素材给三个核心梗与框架，结尾不复合，不靠新男友解围。希望双方都有自洽动机，比较不同情绪落点。'},
 {name:'零散脑洞',material:'设定一：月亮是一台自动贩卖机，每个人一生只能投入一次最珍贵的记忆。设定二：一个修理工发现所有被换走的记忆都保存在机器背面。',request:'把两个设定组合成一组素材，给三个核心梗与结构方向。保留记忆交换规则，不要重生；找不到适配框架就明确给系统建议。'},
];
try {
 mkdirSync(join(tmp,'data'),{recursive:true});copyFileSync(join(cwd,'data/creation-knowledge.json'),join(tmp,'data/creation-knowledge.json'));
 const database=await import('../src/lib/db/index.ts');closeDb=database.closeDb;const columns=Object.keys(model);
 database.getDb().prepare(`INSERT INTO ai_models (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(model));
 const store=await import('../src/lib/creation/store.ts');const {beginCreationRun}=await import('../src/lib/creation/runs.ts');const {runCreationTurn}=await import('../src/lib/creation/agent.ts');
 for(const scenario of scenarios) {
  if(process.env.INKSIGHT_MATERIAL_CASE && scenario.name!==process.env.INKSIGHT_MATERIAL_CASE) continue;
  const session=store.createCreationSession('material-live',{message:scenario.request,files:[{name:scenario.name+'素材',text:scenario.material}],modelId:model.id});
  const run=beginCreationRun('material-live',session.id,{});const started=Date.now();
  console.log(JSON.stringify({scenario:scenario.name,event:'start',model:model.name}));
  try {await runCreationTurn('material-live',session.id,run.session.run!.id,run.controller.signal,(event,data)=>{if(event==='step') console.log(JSON.stringify({scenario:scenario.name,...data}));},{onModelResponse:(feature,content)=>{if(process.env.INKSIGHT_MATERIAL_TRACE) appendFileSync(process.env.INKSIGHT_MATERIAL_TRACE,JSON.stringify({scenario:scenario.name,feature,content})+'\n');}});}finally{run.release();}
  const result=store.readCreationSession('material-live',session.id)!;
  results.push({scenario,...result,elapsedMs:Date.now()-started,callErrors:database.getDb().prepare('SELECT feature,error FROM ai_call_logs WHERE success=0').all()});
  writeFileSync(join(cwd,'docs/verification/creation-material-live'+(process.env.INKSIGHT_MATERIAL_RUN?'-'+process.env.INKSIGHT_MATERIAL_RUN:'')+(process.env.INKSIGHT_MATERIAL_CASE?'-'+scenario.name:'')+'.json'),JSON.stringify({verifiedAt:new Date().toISOString(),model:model.name,results},null,2));
  console.log(JSON.stringify({scenario:scenario.name,status:result.run?.status,error:result.run?.error,directions:result.directions.length,reports:result.reports.length}));
 }
} finally {closeDb?.();process.chdir(cwd);rmSync(tmp,{recursive:true,force:true});}
