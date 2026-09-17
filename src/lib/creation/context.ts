import { z } from 'zod';
import { creationId, CreationError, sourceParagraphs } from './store';
import type { CreationContextSelection, CreationContextTrace, CreationSession, CreationReport, CreationMessage } from './types';

export const contextSelectionSchema=z.object({
  goal:z.string().min(1).max(2000), mode:z.enum(['analysis','discussion','revision','general']),
  reportIds:z.array(z.string()).max(12).default([]),sourceIds:z.array(z.string()).max(5).default([]),
  directionIds:z.array(z.string()).max(12).default([]),noteIds:z.array(z.string()).max(10).default([]),
});
export const decisionUpdateSchema=z.object({
  messageId:z.string(),quote:z.string().min(2).max(2000),directionId:z.string().nullable().default(null),
  replaces:z.array(z.string()).max(10).default([]),acceptedNoteIds:z.array(z.string()).max(10).default([]),
});
const unique=(ids:string[])=>[...new Set(ids)];
export const CONTEXT_CHARACTER_BUDGET=42000;
/** Legacy replies are recoverable references, never automatically accepted decisions. */
export function initializeWorkingMemory(s:CreationSession) {
  s.workingMemory??={schemaVersion:1,decisions:[],notes:[]};
  for(const message of s.messages) {
    if(message.role!=='assistant' || message.reportId || message.directionIds?.length || s.workingMemory.notes.some(n=>n.messageId===message.id)) continue;
    s.workingMemory.notes.push({id:`legacy-note:${message.id}`,messageId:message.id,goal:message.content.slice(0,240),familyIds:[],reportIds:message.context?.reportIds??[],status:'proposal'});
  }
  return s.workingMemory;
}
export function authorMessages(s:CreationSession) {
  return s.messages.filter(m=>m.role==='user').map(m=>{
    let content=m.content;
    // Longest first prevents a short old source from fragmenting a pasted replacement.
    for(const src of [...s.sources].sort((a,b)=>b.text.length-a.text.length)) content=content.replaceAll(src.text,`[用户资料：${src.name}，ID ${src.id}]`);
    return {id:m.id,content};
  });
}
export function reportSourceIds(r:CreationReport) {
  return unique([...(r.sourceId?[r.sourceId]:[]),...r.findings.flatMap(f=>f.evidence.map(e=>e.sourceId))]);
}
const status=(s:CreationSession,id:string)=>id===s.selectedDirectionId?'selected':s.directions.some(d=>d.parentId===id)?'historical':'candidate';
/** All objects are indexed by identity; age is not an eligibility filter. No cross-session reads. */
export function contextCatalog(s:CreationSession) {
  return {
    constraints:s.constraints,selectedDirectionId:s.selectedDirectionId,focusedDirectionId:s.focusedDirectionId,
    sources:s.sources.map(src=>({id:src.id,name:src.name,paragraphs:sourceParagraphs(src).length,preview:src.text.slice(0,180),ending:src.text.slice(-180)})),
    reports:s.reports.map((r,sequence)=>({sequence,id:r.id,scope:r.scope,coverage:r.coverage,sourceIds:reportSourceIds(r),findings:r.findings.map(f=>f.title)})),
    directions:s.directions.map(d=>({id:d.id,familyId:d.familyId,version:d.version,title:d.title,reportId:d.reportId,material:d.material?{sources:d.material.sources,grouping:d.material.grouping}:undefined,status:status(s,d.id),focused:d.id===s.focusedDirectionId,premise:d.premise.slice(0,300)})),
    decisions:s.workingMemory?.decisions??[],notes:(s.workingMemory?.notes??[]).map(n=>({...n,preview:s.messages.find(m=>m.id===n.messageId)?.content.slice(0,400)})),
    lastContext:s.workingMemory?.lastContext,
  };
}
function requireIds(ids:string[],available:{id:string}[],kind:string) {
  if(ids.some(id=>!available.some(item=>item.id===id))) throw new CreationError(`上下文引用的${kind}不属于当前会话或已不存在。`);
}
/** Conservative fallback for old callers; real task resolution explicitly selects from the catalog. */
export function defaultContextSelection(s:CreationSession):CreationContextSelection {
  const latest=authorMessages(s).at(-1)?.content??'';
  const words=latest.match(/[\u3400-\u9fff]{2,}|[a-zA-Z]{3,}/g)??[];
  const terms=unique(words.flatMap(w=>w.length>2?Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)):[w]));
  const reportIds=s.reports.map(r=>({r,score:terms.filter(t=>(r.scope+' '+r.coverage+' '+r.findings.map(f=>f.title).join(' ')).includes(t)).length}))
    .filter(x=>x.score>=2).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.r.id);
  return {goal:latest.slice(-2000)||'继续当前讨论',mode:s.run?.task?'analysis':'general',reportIds,sourceIds:s.run?.task?.sourceIds??[],directionIds:[],noteIds:[]};
}
export function validateContextSelection(s:CreationSession,selection:CreationContextSelection) {
  requireIds(selection.reportIds,s.reports,'报告');requireIds(selection.sourceIds,s.sources,'资料');requireIds(selection.directionIds,s.directions,'方向');
  requireIds(selection.noteIds,s.workingMemory?.notes??[],'讨论记录');
  return selection;
}
/** Only verbatim author instructions become decisions; model replies always remain proposals. */
export function applyDecisionUpdates(s:CreationSession,updates:z.infer<typeof decisionUpdateSchema>[]) {
  const memory=initializeWorkingMemory(s);
  for(const update of updates) {
    const author=authorMessages(s).find(m=>m.id===update.messageId);
    if(!author?.content.includes(update.quote)) throw new CreationError('作者决定必须逐字来自用户要求，不能来自小说正文或模型建议。');
    const direction=update.directionId?s.directions.find(d=>d.id===update.directionId):undefined;
    if(update.directionId && !direction) throw new CreationError('作者决定关联的方向不存在。');
    const familyId=direction?.familyId;
    const previous=update.replaces.map(id=>memory.decisions.find(d=>d.id===id));
    if(previous.some(d=>!d || d.familyId!==familyId)) throw new CreationError('不能覆盖其他方向的作者决定。');
    if(update.replaces.length && update.messageId!==s.messages.filter(m=>m.role==='user').at(-1)?.id) throw new CreationError('更新决定必须依据最新用户要求。');
    requireIds(update.acceptedNoteIds,memory.notes,'已确认建议');
    if(update.acceptedNoteIds.some(id=>{
      const n=memory.notes.find(n=>n.id===id)!;
      return n.familyIds.length>0 && (!familyId || !n.familyIds.includes(familyId));
    })) throw new CreationError('不能把其他方向的建议确认为当前设定。');
    if(memory.decisions.some(d=>d.messageId===update.messageId && d.quote===update.quote && d.familyId===familyId)) continue;
    const latest=s.messages.filter(m=>m.role==='user').at(-1);
    if(update.acceptedNoteIds.length && latest?.id!==update.messageId) throw new CreationError('采纳讨论建议必须来自最新作者确认。');
    previous.forEach(d=>{d!.status='superseded';});
    memory.decisions.push({id:creationId('decision'),messageId:update.messageId,quote:update.quote,familyId,status:'active',replaces:update.replaces,acceptedNoteIds:update.acceptedNoteIds});
  }
}

export function buildCreationContext(s:CreationSession,selection=s.run?.contextSelection??defaultContextSelection(s),budget=CONTEXT_CHARACTER_BUDGET) {
  validateContextSelection(s,selection);
  const request=authorMessages(s).at(-1);
  const directionIds=unique([...(s.selectedDirectionId?[s.selectedDirectionId]:[]),...(s.focusedDirectionId?[s.focusedDirectionId]:[]),...selection.directionIds]);
  const directions=directionIds.map(id=>{
    const d=s.directions.find(d=>d.id===id);
    if(!d) throw new CreationError('当前聚焦或选定版本不存在，请重新选择。');
    return {...d,status:status(s,id),focused:id===s.focusedDirectionId};
  });
  const targetDirectionIds=selection.directionIds.length?selection.directionIds:[s.focusedDirectionId??s.selectedDirectionId].filter((id):id is string=>!!id);
  const families=new Set(directions.filter(d=>targetDirectionIds.includes(d.id)).map(d=>d.familyId));
  const decisions=(s.workingMemory?.decisions??[]).filter(d=>d.status==='active' && (!d.familyId || families.has(d.familyId)));
  const acceptedNotes=unique(decisions.flatMap(d=>d.acceptedNoteIds));
  const notes=unique([...acceptedNotes,...selection.noteIds]).map(id=>{
    const note=s.workingMemory?.notes.find(n=>n.id===id);
    const message=s.messages.find(m=>m.id===note?.messageId);
    if(!note || !message) throw new CreationError('讨论依据已不存在，不能沿用未知结论。');
    return {...note,content:message.content,status:acceptedNotes.includes(id)?'accepted_by_author' as const:'proposal' as const};
  });
  // Origin reports remain provenance, while later explicitly relevant reports are equally available.
  const reportIds=unique([...selection.reportIds,...directions.flatMap(d=>[...(d.reportId?[d.reportId]:[]),...(d.context?.reportIds??[])]),...notes.flatMap(n=>n.reportIds),
    ...s.reports.filter(r=>r.runId===s.run?.id && !!s.run).map(r=>r.id)]);
  requireIds(reportIds,s.reports,'方向或讨论关联报告');
  const reports=reportIds.map(id=>s.reports.find(r=>r.id===id)!);
  const sourceIds=unique([...selection.sourceIds,...(s.run?.task?.sourceIds??[]),...reports.flatMap(reportSourceIds),...directions.flatMap(d=>d.material?.sources.map(src=>src.id)??[])]);
  requireIds(sourceIds,s.sources,'报告关联资料');
  const sources=sourceIds.map(id=>{const src=s.sources.find(s=>s.id===id)!;return {id:src.id,name:src.name,version:src.version,paragraphs:sourceParagraphs(src).length,role:'user_provided_unverified_reference' as const};});
  const omitted:{kind:string;id:string;reason:string}[]=[];
  const base={goal:selection.goal,mode:selection.mode,request,selectedDirectionId:s.selectedDirectionId,focusedDirectionId:s.focusedDirectionId,
    constraints:s.constraints,authorDecisions:decisions,directions,sources,targetDirectionIds,
    authorHistory:authorMessages(s).filter(m=>m.id!==request?.id).map(m=>({...m,decisionStates:(s.workingMemory?.decisions??[]).filter(d=>d.messageId===m.id)})),
    stateRules:'selected是作者已选定的创作基础：其故事核、人物关系与冲突在当前讨论中有效，不能将整个选定版本说成尚未采纳；只有其中明确列出的assumptions/待补项仍待补。它是虚构创作设定，不是对标原文事实。focused仅指本轮讨论对象；candidate与historical不是正式设定。reports是对标分析参考；sources可能是素材叙述或作者虚构设定，均不代表核实的现实事实。material.authorSettings为作者明示虚构，assumptions为系统新增建议，不能冒充素材。proposal是待选建议，不得用其中新增人物或事件覆盖选定版本；讨论具体设定必须核对directions的真实字段。仅accepted_by_author才有明确采纳记录。authorHistory是历史要求而非本轮任务；decisionStates标明历史要求的方向归属和是否已被替换；以active作者决定和当前要求为准，不能复活superseded决定或把其他方向约束套入当前方向。',
  };
  let used=JSON.stringify(base).length;
  if(used>budget) throw new CreationError('本轮必要版本和作者约束超出上下文预算，请缩小讨论范围；未静默丢弃。');
  const keptReports:CreationReport[]=[];
  for(const r of reports) {
    // Retrieval audit snapshots stay on disk; the report's actually used citations remain.
    const {searches:_,...body}=r;
    const cost=JSON.stringify(body).length;
    if(used+cost<=budget){keptReports.push(body);used+=cost;}
    else omitted.push({kind:'report',id:r.id,reason:'上下文预算不足，需缩小讨论范围或分轮读取。'});
  }
  const keptNotes:typeof notes=[];
  for(const n of notes){const cost=JSON.stringify(n).length;if(used+cost<=budget){keptNotes.push(n);used+=cost;}else omitted.push({kind:'note',id:n.id,reason:'上下文预算不足。'});}
  const trace:CreationContextTrace={...selection,messageId:request?.id??'',sourceIds,reportIds:keptReports.map(r=>r.id),directionIds,
    noteIds:keptNotes.map(n=>n.id),selectedDirectionId:s.selectedDirectionId,focusedDirectionId:s.focusedDirectionId,
    targetDirectionIds,decisionIds:decisions.map(d=>d.id),omitted,characters:used};
  return {...base,reports:keptReports,discussionNotes:keptNotes,trace};
}

export function rememberDiscussion(s:CreationSession,message:CreationMessage,trace:CreationContextTrace) {
  s.workingMemory??={schemaVersion:1,decisions:[],notes:[]};
  message.context=trace;
  s.workingMemory.lastContext=trace;
  const families=unique((trace.targetDirectionIds??trace.directionIds).flatMap(id=>{const d=s.directions.find(d=>d.id===id);return d?[d.familyId]:[];}));
  s.workingMemory.notes.push({id:creationId('note'),messageId:message.id,goal:trace.goal,familyIds:families,reportIds:trace.reportIds,status:'proposal'});
}
