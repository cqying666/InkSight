import type { CreationSession } from './types';

/** Messages persist the original display order. Selection cards are not new batches. */
export function candidateBatches(s:CreationSession) {
  const seen=new Set<string>();
  return s.messages.flatMap(message=>{
    if(message.role!=='assistant' || !message.directionIds?.length) return [];
    const ids=message.directionIds.filter(id=>s.directions.some(d=>d.id===id));
    const fresh=ids.filter(id=>!seen.has(id));
    ids.forEach(id=>seen.add(id));
    if(!fresh.length) return [];
    return [{id:message.id,createdAt:message.createdAt,directions:fresh.map((id,index)=>{
      const d=s.directions.find(d=>d.id===id)!;
      return {id,title:d.title,version:d.version,position:index+1};
    })}];
  });
}

/** Narrow unambiguous discussion command; creative prose and mixed instructions go to the planner. */
export function resolveDiscussionTarget(s:CreationSession,message:string):{directionId?:string;batchId?:string;question?:string}|null {
  const command=message.trim().replace(/[。！!]+$/,'');
  const match=command.match(/^(?:请|我们|那我们)?(?:继续聊|继续讨论|聊聊|讨论|聊)(?:(最新|上一|第一|最初)(?:一)?(?:组|轮)(?:的)?)?第([一二三四五1-5])个(?:候选方向|候选|方向)?(?:吧)?$/);
  if(!match) return null;
  const batches=candidateBatches(s);
  const batch=match[1]==='第一'||match[1]==='最初'?batches[0]:match[1]==='上一'?batches.at(-2):batches.at(-1);
  const n='一二三四五'.indexOf(match[2]);const position=n>=0?n+1:Number(match[2]);
  const d=batch?.directions.find(d=>d.position===position);
  return d?{directionId:d.id,batchId:batch!.id}:{question:`这组候选中没有第${position}个，请告诉我想讨论的方向名称。`};
}
