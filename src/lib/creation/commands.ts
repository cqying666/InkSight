import type { CreationSession } from './types';
import { candidateBatches } from './batches';
/** Recognize only stand-alone author commands; quoted prose and mixed requests never write state. */
export function resolveDirectionCommand(s:CreationSession, message:string):{directionId:string;save:boolean}|null {
  const command=message.trim().replace(/[。！!]+$/,'');
  const match=command.match(/^(?:我|请|帮我|请帮我)?(?:就)?(选定|选择|选|用|保存)(.+?)(?:并保存|，保存下来|保存下来)?$/);
  if(!match || /[\n「」“”"?？]/.test(command)) return null;
  const target=match[2].replace(/(?:并保存|，保存下来|保存下来)$/,'').trim();
  const candidates=candidateBatches(s).at(-1)?.directions??[];
  let directionId:string|undefined;
  const ordinal=target.match(/^第([一二三四五1-5])个(?:方向)?$/);
  if(ordinal) {const index='一二三四五'.indexOf(ordinal[1]); directionId=candidates[index>=0?index:Number(ordinal[1])-1]?.id;}
  else if(/^(这个(?:方向)?|当前(?:方向)?|选定的方向)$/.test(target)) directionId=target==='选定的方向'?s.selectedDirectionId:(s.focusedDirectionId??s.selectedDirectionId);
  else {const matches=s.directions.filter(d=>d.title===target || d.id===target);if(matches.length===1) directionId=matches[0].id;}
  return directionId?{directionId,save:match[1]==='保存'||/保存/.test(command)}:null;
}
