import { getModelById } from '@/lib/ai/models';
import { creationId, mutateCreationSession, idleOnly, appendCreationMessage, addCreationSources, readCreationSession, CreationError } from './store';
import { CREATION_LIMITS } from './types';

const controllers = new Map<string,AbortController>();
const key = (userId:string,id:string) => `${userId}:${id}`;
export function beginCreationRun(userId:string,id:string,input:{message?:string;files?:{name:string;text:string}[];modelId?:string;retry?:boolean}) {
  // Recovers expired runs before enforcing the persistent concurrency lock.
  readCreationSession(userId,id);
  const session=mutateCreationSession(userId,id,s=>{
    idleOnly(s);
    if(!input.message?.trim() && !input.files?.length && s.run && !input.retry) throw new CreationError('本轮已经执行过，请发送新问题或点击重试。',409);
    if(input.retry && s.run && !['failed','stopped'].includes(s.run.status)) throw new CreationError('只有失败或停止的任务可以重试。',409);
    if(input.modelId) s.modelId=input.modelId;
    if(s.modelId && !getModelById(s.modelId)?.isActive) throw new CreationError('所选模型已停用或不存在，请选择可用模型。');
    if(input.files?.length) addCreationSources(s,input.files);
    if(input.message?.trim()) appendCreationMessage(s,input.message.trim());
    else if(input.files?.length) appendCreationMessage(s,'我补充了资料，请结合前面的要求处理；用途不明时先询问。');
    s.run={id:creationId('run'),status:'running',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),steps:[]};
  });
  const controller=new AbortController();
  controllers.set(key(userId,id),controller);
  const timer=setTimeout(()=>controller.abort(new CreationError('本轮已超过 180 秒，已保留完成结果，请缩小目标后重试。')),CREATION_LIMITS.timeoutMs);
  return {session,controller,release:()=>{clearTimeout(timer);if(controllers.get(key(userId,id))===controller) controllers.delete(key(userId,id));}};
}
export function stopCreationRun(userId:string,id:string) {
  const session=mutateCreationSession(userId,id,s=>{
    if(s.run?.status==='running') {
      s.run.status='stopped';s.run.error='作者已停止任务，已保留完成结果。';
      s.run.steps.forEach(step=>{if(step.status==='running'){step.status='failed';step.detail='已停止';}});
    }
  });
  controllers.get(key(userId,id))?.abort();
  return session;
}
