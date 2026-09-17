import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { CREATION_LIMITS, type CreationSession, type CreationSummary, type CreationSource } from './types';

export class CreationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const now = () => new Date().toISOString();
export const creationId = (kind: string) => `${kind}_${randomUUID()}`;
function database() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS creation_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS creation_sessions_owner ON creation_sessions(user_id, updated_at DESC);`);
  return db;
}
export function sourceParagraphs(source: Pick<CreationSource, 'text'>) {
  return source.text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}
export function addCreationSources(session: CreationSession, files: {name: string; text: string}[]) {
  for (const file of files) {
    const text = file.text.trim();
    if (!text) continue;
    const version = createHash('sha256').update(text).digest('hex');
    if (session.sources.some(s => s.version === version && s.name === file.name)) continue;
    session.sources.push({ id: creationId('source'), name: file.name, text, version });
  }
  if (session.sources.length > CREATION_LIMITS.sourceCount || session.sources.reduce((n,s) => n + s.text.length,0) > CREATION_LIMITS.sourceChars)
    throw new CreationError('本版每个会话最多 5 份资料、合计 30000 字。请缩小范围或另开会话；未截断原文。');
}
export function appendCreationMessage(session: CreationSession, content: string) {
  if (session.messages.length >= 100 || session.messages.filter(m => m.role === 'user').reduce((n,m) => n+m.content.length,0) + content.length > 24000)
    throw new CreationError('本会话的讨论已达到上下文上限，请保存方向后另开会话。');
  session.messages.push({ id: creationId('message'), role: 'user', content, createdAt: now() });
}
export function createCreationSession(userId: string, input: {message: string; files?: {name:string;text:string}[]; modelId?: string; task?: string}) {
  const session: CreationSession = { id: creationId('creation'), title: (input.message || input.files?.[0]?.name || '新的创作讨论').slice(0,40), modelId: input.modelId,
    sources: [], messages: [], constraints: [], reports: [], directions: [], savedDirectionIds: [], revision: 0, createdAt: now(), updatedAt: now() };
  addCreationSources(session, input.files ?? []);
  appendCreationMessage(session, [input.task, input.message].filter(Boolean).join('\n') || '我提供了一份资料，请先询问我希望如何处理。');
  database().prepare('INSERT INTO creation_sessions (id,user_id,data,updated_at) VALUES (?,?,?,?)').run(session.id,userId,JSON.stringify(session),session.updatedAt);
  return session;
}
function rawSession(userId: string, id: string): CreationSession | null {
  const row = database().prepare('SELECT data FROM creation_sessions WHERE id=? AND user_id=?').get(id,userId) as {data:string}|undefined;
  return row ? JSON.parse(row.data) : null;
}
export function mutateCreationSession(userId: string, id: string, mutate: (s: CreationSession) => void): CreationSession {
  return database().transaction(() => {
    const s = rawSession(userId,id);
    if (!s) throw new CreationError('会话不存在',404);
    mutate(s);
    s.revision++; s.updatedAt = now();
    database().prepare('UPDATE creation_sessions SET data=?,updated_at=? WHERE id=? AND user_id=?').run(JSON.stringify(s),s.updatedAt,id,userId);
    return s;
  })();
}
export function readCreationSession(userId:string,id:string) {
  const s = rawSession(userId,id);
  if (s?.run?.status === 'running' && Date.now()-Date.parse(s.run.startedAt) > CREATION_LIMITS.timeoutMs + 10000) {
    return mutateCreationSession(userId,id,latest => {
      if (latest.run?.id === s.run?.id && latest.run?.status === 'running') {
        latest.run.status = 'failed'; latest.run.error = '任务已超时或服务中断，已保留完成的结果，请重试。';
        latest.run.steps.forEach(step => { if (step.status === 'running') step.status = 'failed'; });
      }
    });
  }
  return s;
}
export function listCreationSessions(userId:string): CreationSummary[] {
  const rows = database().prepare('SELECT id FROM creation_sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(userId) as {id:string}[];
  return rows.map(({id}) => readCreationSession(userId,id)!).map(s => ({id:s.id,title:s.title,workId:s.workId,updatedAt:s.updatedAt,status:s.run?.status}));
}
export function idleOnly(s:CreationSession) {
  if (s.run?.status === 'running') throw new CreationError('任务正在执行，请先停止或等待完成。',409);
}
export function directionAction(userId:string,id:string,action:'focus'|'select'|'save',directionId:string) {
  return mutateCreationSession(userId,id,s => {
    idleOnly(s);
    if (!s.directions.some(d => d.id === directionId)) throw new CreationError('方向版本不存在',404);
    if (action === 'focus') s.focusedDirectionId = directionId;
    if (action === 'select') { s.selectedDirectionId = directionId; s.focusedDirectionId = directionId; }
    if (action === 'save') {
      if (s.selectedDirectionId !== directionId) throw new CreationError('请先选定要保存的具体版本。');
      if (!s.savedDirectionIds.includes(directionId)) s.savedDirectionIds.push(directionId);
    }
  });
}
export function handoffCreationDirection(userId:string,id:string,directionId:string) {
  let workId = '';
  const session = mutateCreationSession(userId,id,s => {
    idleOnly(s);
    const d = s.directions.find(item => item.id === directionId);
    if (!d || s.selectedDirectionId !== directionId) throw new CreationError('请先选定要带入工作台的方向。');
    // One new work per confirmed version. Never overwrite any existing manuscript.
    workId = `creation-work-${d.id}`;
    const key = `u:${userId}:works`;
    const row = database().prepare('SELECT data FROM writing_documents WHERE key=?').get(key) as {data:string}|undefined;
    const works: {id:string;[key:string]:unknown}[] = row ? JSON.parse(row.data) : [];
    if (!Array.isArray(works)) throw new CreationError('作品数据格式异常，未执行保存。',409);
    if (!works.some(w => w.id === workId)) {
      const outline = [d.title, `故事核：${d.premise}`, `人物关系：${d.characters}`, `冲突：${d.conflict}`, `信息差：${d.informationGap}`, `情绪落点：${d.emotionalGoal}`, `迁移机制：${d.mechanism}`, `实质变化：${d.changes}`, `待补设定：${d.assumptions.join('；')}`, `风险：${d.risks.join('；')}`, `作者约束：${(d.authorConstraints??s.constraints).join('；')}`, `作者历次要求（保留原始上下文，冲突时需确认）：\n${s.messages.filter(m=>m.role==='user').map(m=>m.content).join('\n\n')}`, `来源会话：${s.id}，方向版本：${d.version}`, ...(d.material ? [`素材价值：${d.material.value}`, `保留：${d.material.retained}\n改变：${d.material.changed}`, `作者明确虚构设定：${d.material.authorSettings.join('；')||'未提供'}`, `主角欲望：${d.material.protagonist.desire}\n阻力：${d.material.protagonist.obstacle}\n代价：${d.material.protagonist.cost}\n关键选择：${d.material.choices}`,
        `框架适配情况：${d.material.frameworkStatus}`,
        ...d.material.frameworks.map(f=>`${f.name}（${f.kind==='system'?'系统建议':'知识库参考'}）\n匹配理由：${f.fit}\n前提：${f.prerequisites.join('；')}\n局限：${f.limitations.join('；')}\n其他选择与取舍：${f.tradeoff}\n简短推进链（非完整大纲）：${f.beats.join(' → ')}`),
        `素材来源：${d.material.sources.map(src=>`${src.name} · 版本 ${src.version}${src.start?` · 第${src.start}—${src.end}段`:''}`).join('；')}`,
        `知识来源快照：\n${(d.knowledge??[]).map(k=>`${k.title}\n${k.source} · 版本 ${k.version}\n${k.text}`).join('\n\n')||'未引用知识库条目；结构方向为系统建议。'}`] : [])].join('\n\n');
      works.unshift({id:workId,title:d.title,html:'',plainText:'',savedAt:Date.now(),documents:{benchmark:s.sources.map(src => `【${src.name}】\n${src.text}`).join('\n\n'),outline,synopsis:'',characters:d.characters},creationOrigin:{sessionId:s.id,directionId:d.id,reportId:d.reportId,direction:JSON.parse(JSON.stringify(d)),constraints:[...s.constraints],authorInstructions:s.messages.filter(m=>m.role==='user').map(m=>m.content)}});
      database().prepare('INSERT INTO writing_documents (key,data,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(key,JSON.stringify(works),now());
    }
    s.workId = workId;
    if (!s.savedDirectionIds.includes(directionId)) s.savedDirectionIds.push(directionId);
  });
  return {session,workId};
}
