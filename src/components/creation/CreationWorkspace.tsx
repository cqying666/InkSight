'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCreationEventDecoder } from './event-stream';
import { creationStepPresentation } from './step-presentation';
import { CoachInput, type UploadedFile } from '@/components/home/CoachInput';
import type { CreationSession, CreationSummary, CreationReport, CreationSource, CreationDirection, CreationContextTrace } from '@/lib/creation/types';

const button = 'max-w-full break-words text-left rounded-lg border border-text/10 px-3 py-2 text-xs text-text hover:border-accent/40 hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed';
const statusLabels = { running: '执行中', complete: '本轮完成', waiting: '等待补充', failed: '执行失败', stopped: '已停止' };
type Detail = { type: 'report'; report: CreationReport } | { type: 'source'; source: CreationSource; paragraph?: number } | { type: 'direction'; direction: CreationDirection };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || '请求失败，请重试');
  return data as T;
}
const json = (body: unknown, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function ReportSearches({ report }: { report: CreationReport }) {
  if (!report.searches) return null; // Older reports have no retrieval audit trail.
  return <details className="mt-4 rounded-lg border border-text/10 p-4">
    <summary className="cursor-pointer text-xs text-accent">知识检索记录 · {report.searches.length} 次检索 · {report.knowledge.length} 条引用</summary>
    {!report.searches.length && <p className="mt-3 text-xs text-text-muted">本次分析前未执行知识检索。</p>}
    {report.searches.map((search, index) => <div key={index} className="mt-4 text-xs leading-6">
      <p>检索词：{search.query}</p>
      {search.error ? <p className="text-text-muted">{search.error}</p> : !search.results.length && <p className="text-text-muted">本次检索没有命中条目。</p>}
      {search.results.map(item => <details key={item.id} className="mt-2 border-l border-text/10 pl-3">
        <summary className="cursor-pointer">{item.title} · {report.knowledge.some(k => k.id === item.id) ? '已引用' : '命中但未引用'}</summary>
        <p className="mt-2 whitespace-pre-wrap">{item.text}</p>
        <p className="mt-2 break-all text-text-muted">{item.source} · 版本 {item.version}</p>
      </details>)}
    </div>)}
  </details>;
}

function ContextDetails({trace,session,onDetail}:{trace:CreationContextTrace;session:CreationSession;onDetail:(detail:Detail)=>void}) {
  return <details className="mt-4 rounded-lg border border-text/10 p-3 text-xs leading-6">
    <summary className="cursor-pointer text-accent">本轮上下文 · {trace.reportIds.length} 份分析 · {trace.decisionIds.length} 条作者决定</summary>
    <p className="mt-3">本轮目标：{trace.goal}</p>
    {trace.directionIds.map(id=>{const d=session.directions.find(d=>d.id===id);return d && <div key={id}><button className="text-accent underline" onClick={()=>onDetail({type:'direction',direction:d})}>{d.title} · v{d.version}</button><span className="text-text-muted"> · {trace.selectedDirectionId===id?'当时已选定':trace.focusedDirectionId===id?'当时正在讨论':'本轮参考候选'}</span></div>;})}
    {trace.reportIds.map(id=>{const report=session.reports.find(r=>r.id===id);return report && <div key={id}><button className="text-left text-accent underline" onClick={()=>onDetail({type:'report',report})}>{report.scope}</button><p className="text-text-muted">{report.coverage}</p></div>;})}
    {trace.decisionIds.map(id=>{const d=session.workingMemory?.decisions.find(d=>d.id===id);return d && <p key={id}>作者要求：{d.quote}{d.status==='superseded'?'（之后已更新）':''}</p>;})}
    {trace.noteIds.length>0 && <p className="text-text-muted">参考了 {trace.noteIds.length} 条前序讨论记录；未被作者采纳的内容仍作为建议。</p>}
    {trace.omitted.map(item=><p key={`${item.kind}:${item.id}`} className="text-accent">{item.reason}</p>)}
    <p className="mt-2 text-text-muted">这些内容已提供给本轮执行工具，不代表每项都被最终答复采用。</p>
  </details>;
}


function MaterialDetails({ direction, session, onDetail }: { direction: CreationDirection; session: CreationSession; onDetail: (detail: Detail) => void }) {
  const material = direction.material;
  if (!material) return null;
  return <section className="mt-6 space-y-5 border-t border-text/10 pt-5" aria-label="素材与框架依据">
    <h3 className="font-serif text-lg">素材怎样成为故事</h3>
    <p className="text-xs leading-6 text-text-muted">以下原始素材是作者提供的叙述，未经事实核实。作者设定与系统新增设定分别保留。</p>
    <div className="flex flex-wrap gap-2">{material.sources.map(reference => {
      const source = session.sources.find(item => item.id === reference.id && item.version === reference.version);
      return <button key={reference.id} className={button} disabled={!source} onClick={() => source && onDetail({ type: 'source', source, paragraph: reference.start })}>{reference.name}{reference.start ? ` · 第${reference.start}—${reference.end}段` : ''} · {reference.version.slice(0, 10)} {source ? '→' : '（此版本不可用）'}</button>;
    })}</div>
    <dl className="space-y-4 text-sm leading-7">{[
      ['素材关系', { group: '一组素材', alternatives: '不同备选素材', combine: '组合元素' }[material.grouping]],
      ['值得写的矛盾', material.value], ['保留的素材', material.retained], ['构思中的改变', material.changed],
      ['生成此版本时的作者约束', direction.authorConstraints?.join('；') || '见会话要求'],
      ['作者明确的虚构设定', material.authorSettings.join('；') || '未提供'],
      ['系统新增的虚构设定', direction.assumptions.join('；') || '未新增'],
      ['主角欲望', material.protagonist.desire], ['阻力', material.protagonist.obstacle], ['代价', material.protagonist.cost],
      ['关键选择与后果', material.choices], ['待补条件与风险', direction.risks.join('；') || '未列出'],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap">{value}</dd></div>)}</dl>
    <div><h3 className="font-serif text-lg">框架适配</h3><p className="mt-2 text-sm leading-7">{material.frameworkStatus}</p>
      {material.frameworks.map((framework, index) => <details key={index} className="mt-3 rounded-lg border border-text/10 p-4">
        <summary className="cursor-pointer text-sm text-accent">{framework.name} · {framework.kind === 'knowledge' ? '知识库参考' : '系统建议'}<span className="block mt-1 text-xs text-text-muted">展开匹配理由、成立前提与取舍</span></summary>
        <dl className="mt-4 space-y-3 text-xs leading-6">{[['为什么适合', framework.fit], ['成立前提', framework.prerequisites.join('；') || '未列出'], ['不匹配与局限', framework.limitations.join('；') || '未列出'], ['其他选择与取舍', framework.tradeoff], ['关键推进链（非章节大纲）', framework.beats.join(' → ')]].map(([label, value]) => <div key={label}><dt className="text-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap">{value}</dd></div>)}</dl>
        {framework.knowledgeIds.map(id => {
          const citation = direction.knowledge?.find(item => item.id === id);
          return citation ? <details key={id} className="mt-3 border-t border-text/10 pt-3"><summary className="cursor-pointer text-xs text-accent">知识依据：{citation.title}</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-6">{citation.text}</p><p className="mt-2 break-all text-[10px] text-text-muted">{citation.source} · 版本 {citation.version}</p></details> : <p key={id} className="mt-3 text-xs text-text-muted">该知识依据当前不可用。</p>;
        })}
        {framework.kind === 'system' && <p className="mt-3 text-xs text-text-muted">这是系统提出的结构方向，不代表知识库已有框架。</p>}
      </details>)}
    </div>
  </section>;
}

export function CreationWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const autostart = params.get('start') === '1';
  const [session, setSession] = useState<CreationSession | null>(null);
  const [history, setHistory] = useState<CreationSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingConstraints, setEditingConstraints] = useState(false);
  const [constraints, setConstraints] = useState('');
  const started = useRef(new Set<string>());
  const pendingRequests = useRef(new Set<string>());
  const dialog = useRef<HTMLElement>(null);
  const activeId = useRef(id);
  activeId.current = id;
  const running = streaming || session?.run?.status === 'running';
  const updateSession = useCallback((next: CreationSession) => {
    if (next.id !== activeId.current) return;
    setSession(previous => !previous || next.revision >= previous.revision ? next : previous);
  }, []);
  const refresh = useCallback(async () => {
    if (!id) return;
    const next = await api<CreationSession>(`/api/creation-sessions?id=${encodeURIComponent(id)}`);
    updateSession(next);
  }, [id, updateSession]);

  const run = useCallback(async (message?: string, files?: UploadedFile[], modelId?: string, retry = false) => {
    if (!id || pendingRequests.current.has(id)) return false;
    pendingRequests.current.add(id);
    setError(''); setStreaming(true);
    let completed = false;
    try {
      const response = await fetch('/api/creation-agent', json({ sessionId: id, message, files: files?.map(({ name, text }) => ({ name, text })), modelId: modelId || undefined, retry }));
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '无法开始执行');
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      const events = createCreationEventDecoder((event, payload) => {
        const data = payload as { session?: CreationSession; step?: NonNullable<CreationSession['run']>['steps'][number]; message?: string };
        if (activeId.current !== id) return;
        if (data.session) updateSession(data.session);
        if (event === 'step' && data.step) { const step = data.step; setSession(previous => previous?.run ? { ...previous, run: { ...previous.run, steps: [...previous.run.steps.filter(item => item.id !== step.id), step] } } : previous); }
        if (event === 'done') completed = true;
        if (event === 'error') throw new Error(data.message || '本轮执行失败');
      });
      try {
        while (true) {
          const chunk = await reader.read();
          events.push(decoder.decode(chunk.value, { stream: !chunk.done }));
          if (chunk.done) break;
        }
        events.finish();
      } finally { reader.releaseLock(); }
      if (!completed && activeId.current === id) setError('连接已结束，正在同步已保存的执行状态。可根据下方状态继续或重试。');
      return completed;
    } catch (cause) {
      if (activeId.current === id) setError(cause instanceof Error ? cause.message : '连接中断，输入已保留');
      return false;
    } finally {
      pendingRequests.current.delete(id);
      if (activeId.current === id) { setStreaming(false); await refresh().catch(() => {}); }
    }
  }, [id, refresh, updateSession]);

  useEffect(() => { api<CreationSummary[]>('/api/creation-sessions').then(setHistory).catch(cause => setError(cause.message)); }, [id]);
  useEffect(() => {
    setSession(null); setDetail(null); setError(''); setStreaming(false); setLoading(true); setEditingConstraints(false);
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    api<CreationSession>(`/api/creation-sessions?id=${encodeURIComponent(id)}`).then(next => {
      if (cancelled) return;
      updateSession(next); setLoading(false);
      if (autostart && !started.current.has(id) && !next.run) {
        started.current.add(id); router.replace(`/creation?id=${encodeURIComponent(id)}`); void run();
      }
    }).catch(cause => { if (!cancelled) { setError(cause.message); setLoading(false); } });
    return () => { cancelled = true; };
    // URL start is consumed once; removing it must not reset the active stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (!id || !running) return;
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 2500);
    return () => clearInterval(timer);
  }, [id, running, refresh]);
  useEffect(() => {
    if (!detail) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
      if (event.key === 'Tab') {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], textarea, input, [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    if (detail.type === 'source' && detail.paragraph) document.getElementById(`creation-paragraph-${detail.paragraph}`)?.scrollIntoView({ block: 'center' });
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); previousFocus?.focus(); };
  }, [detail]);

  const action = async (kind: 'focus' | 'select' | 'save' | 'handoff' | 'constraints', directionId?: string) => {
    if (!id || running || mutating) return;
    setMutating(true); setError('');
    try {
      const result = await api<CreationSession | { session: CreationSession; workId: string }>('/api/creation-sessions', json({ id, action: kind, directionId, ...(kind === 'constraints' ? { constraints: constraints.split('\n').map(value => value.trim()).filter(Boolean) } : {}) }, 'PATCH'));
      if ('session' in result) { updateSession(result.session); router.push(`/write?id=${encodeURIComponent(result.workId)}`); }
      else updateSession(result);
      if (kind === 'constraints') setEditingConstraints(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setMutating(false); }
  };
  const selected = session?.directions.find(direction => direction.id === session.selectedDirectionId);
  const focused = session?.directions.find(direction => direction.id === session.focusedDirectionId);
  const openReport = (reportId: string) => { const report = session?.reports.find(item => item.id === reportId); if (report) setDetail({ type: 'report', report }); };

  return <main className="min-h-screen break-words bg-bg text-text">
    <header className="border-b border-text/10 px-5 py-5 md:px-10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div><button onClick={() => router.push('/')} className="text-xs text-text-muted hover:text-accent">← InkSight 首页</button><h1 className="mt-2 font-serif text-2xl">{session?.title || '创作会话'}</h1><p className="mt-1 text-xs text-text-muted">{session?.workId ? '已关联作品 · 已确认成果可在工作台查看' : '未关联作品 · 从理解故事，到选定方向'}</p></div>
        <div className="flex gap-2"><button className={button} onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>历史会话</button><button className={button} onClick={() => router.push('/')}>＋ 新会话</button></div>
      </div>
    </header>
    {(showHistory || !id) && <section aria-label="历史会话" className="mx-auto max-w-5xl border-b border-text/10 px-5 py-6"><p className="mb-3 text-xs text-text-muted">最近的创作讨论</p><div className="grid gap-2 sm:grid-cols-2">{history.map(item => <button key={item.id} onClick={() => { setShowHistory(false); router.push(`/creation?id=${encodeURIComponent(item.id)}`); }} className="rounded-xl border border-text/10 bg-surface p-4 text-left hover:border-accent/40"><p className="truncate font-serif">{item.title}</p><p className="mt-2 text-xs text-text-muted">{new Date(item.updatedAt).toLocaleString('zh-CN')} · {item.status ? statusLabels[item.status] : '尚未执行'}</p></button>)}</div>{!history.length && <p className="py-8 text-sm text-text-muted">还没有创作会话。回到首页，带来想拆解的故事，或想发展的素材。</p>}</section>}
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      {loading && <p role="status" className="py-12 text-text-muted">正在读取会话…</p>}
      {session && <>
        <section className="mb-8 border-b border-text/10 pb-5" aria-label="当前上下文">
          <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-text-muted">当前资料</span>{session.sources.map(source => <button key={source.id} className={button} onClick={() => setDetail({ type: 'source', source })}>{source.name} · {source.text.length.toLocaleString()} 字</button>)}{!session.sources.length && <span className="text-xs text-text-muted">暂无独立资料，可在下方补充文件或文本</span>}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs text-text-muted">硬约束</span>{session.constraints.map((constraint, index) => <span key={index} className="rounded bg-accent/5 px-2 py-1 text-xs text-accent">{constraint}</span>)}<button className="text-xs text-accent underline underline-offset-4 disabled:opacity-40" disabled={!!running} onClick={() => { setConstraints(session.constraints.join('\n')); setEditingConstraints(!editingConstraints); }}>管理约束</button></div>
          {editingConstraints && <div className="mt-3 rounded-xl border border-text/10 bg-surface p-4"><label htmlFor="creation-constraints" className="text-xs text-text-muted">每行一条。这里的约束会持续用于后续讨论；修改由你确认。</label><textarea id="creation-constraints" value={constraints} onChange={event => setConstraints(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-text/10 bg-bg p-3 text-sm" /><button className={button} disabled={mutating || !!running} onClick={() => void action('constraints')}>确认约束</button></div>}
          {focused && <p className="mt-3 text-xs text-accent">正在讨论：{focused.title} · v{focused.version}（{focused.id === selected?.id ? '已选定' : '未选定'}）</p>}
          {!!session.workingMemory?.decisions.length && <details className="mt-3 text-xs leading-6"><summary className="cursor-pointer text-accent">作者明确要求与决定</summary>{session.workingMemory.decisions.filter(d=>d.status==='active' && (!d.familyId || d.familyId===(focused??selected)?.familyId)).map(d=><p key={d.id} className="mt-2">{d.quote}<span className="text-text-muted"> · {d.familyId?'适用于该方向':'会话通用'}</span></p>)}<p className="mt-2 text-text-muted">可在对话中明确修改这些要求；模型提出的建议不会自动成为设定。</p></details>}
        </section>
        <div className="space-y-8">
          {session.messages.map(message => <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-2xl bg-text/[0.04] px-5 py-4' : 'border-l-2 border-accent/40 pl-5'}>
            <p className="mb-3 text-[11px] tracking-widest text-text-muted">{message.role === 'user' ? '你' : 'INKSIGHT · 创作教练'}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
            {message.context && <ContextDetails trace={message.context} session={session} onDetail={setDetail} />}
            {message.reportId && <button className={`${button} mt-4`} onClick={() => openReport(message.reportId!)}>查看完整拆解与依据 →</button>}
            {!!message.directionIds?.length && <div className="mt-5 grid gap-4">{message.directionIds.map(directionId => {
              const direction = session.directions.find(item => item.id === directionId); if (!direction) return null;
              const newer = session.directions.some(item => item.familyId === direction.familyId && item.version > direction.version);
              return <section key={direction.id} className={`rounded-xl border bg-surface p-5 ${selected?.id === direction.id ? 'border-accent/60' : 'border-text/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-lg">{direction.title}</h3><span className="text-xs text-text-muted">v{direction.version}{newer ? ' · 历史版本' : ''}{selected?.id === direction.id ? ' · 已选定' : ''}{session.savedDirectionIds.includes(direction.id) ? ' · 已保存' : ''}</span></div>
                <p className="mt-3 text-sm leading-7">{direction.premise}</p><dl className="mt-4 space-y-2 text-xs leading-6"><div><dt className="inline text-text-muted">{direction.material ? '推进机制' : '迁移机制'} · </dt><dd className="inline">{direction.mechanism}</dd></div><div><dt className="inline text-text-muted">实质变化 · </dt><dd className="inline">{direction.changes}</dd></div></dl>
                {direction.material && <details className="mt-4 rounded-lg border border-text/10 p-3"><summary className="cursor-pointer text-xs text-accent">素材关联、新增设定与框架比较 · {direction.material.frameworks.length} 个建议</summary><MaterialDetails direction={direction} session={session} onDetail={setDetail} /></details>}
                <div className="mt-4 flex flex-wrap gap-2"><button className={button} onClick={() => setDetail({ type: 'direction', direction })}>详情与版本</button><button className={button} disabled={!!running || mutating} onClick={() => void action('focus', direction.id)}>{focused?.id === direction.id ? '正在讨论' : '讨论此方向'}</button><button className={button} disabled={!!running || mutating || selected?.id === direction.id} onClick={() => void action('select', direction.id)}>选定 v{direction.version}</button></div>
              </section>;
            })}<button className={`${button} justify-self-start`} disabled={!!running} onClick={() => void run('请比较这些候选方向的关键关系、冲突动力、人物选择与风险，帮助我选择。')}>比较候选方向</button></div>}
          </article>)}
        </div>
        {session.reports.some(report => !session.messages.some(message => message.reportId === report.id)) && <div className="mt-6 flex flex-wrap gap-2">{session.reports.filter(report => !session.messages.some(message => message.reportId === report.id)).map(report => <button key={report.id} className={button} onClick={() => openReport(report.id)}>查看已完成拆解：{report.scope}</button>)}</div>}
        {session.run && <section aria-live="polite" className="mt-8 rounded-xl border border-text/10 p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium">{statusLabels[session.run.status]}</p>{running && <button className={button} onClick={async () => { try { updateSession(await api<CreationSession>('/api/creation-agent/stop', json({ sessionId: id }))); setStreaming(false); } catch (cause) { setError(cause instanceof Error ? cause.message : '停止失败'); } }}>停止执行</button>}</div><ol className="mt-3 space-y-2">{session.run.steps.map((step, index) => {
          const presentation = creationStepPresentation(session.run!.steps, index);
          return <li key={step.id} className="text-xs text-text-muted">{presentation.marker} {step.label}
            {presentation.recovered ? <><span className="ml-2 text-text">{presentation.outcome}</span>{step.detail && <details className="mt-1 pl-4"><summary className="cursor-pointer">查看当时的失败原因</summary><p className="mt-1">{step.detail}</p></details>}</> : step.detail && <span className="ml-2">{step.detail}</span>}
          </li>;
        })}</ol>{session.run.error && <p className="mt-3 text-xs text-danger">{session.run.error}</p>}{!running && (session.run.status === 'failed' || session.run.status === 'stopped') && <button className={`${button} mt-3`} onClick={() => void run(undefined, undefined, undefined, true)}>重试未完成任务</button>}</section>}
        {selected && <section className="mt-8 rounded-xl border border-accent/30 bg-accent/[0.04] p-5"><p className="text-xs text-accent">已选定成果</p><h2 className="mt-2 font-serif text-lg">{selected.title} · v{selected.version}</h2><p className="mt-2 text-xs text-text-muted">{session.savedDirectionIds.includes(selected.id) ? '此版本已保存为会话成果。' : '已选定，尚未保存为成果。'}进入工作台会为此方向建立作品，带入该版本的方向与相关资料。</p><div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={!!running || mutating || session.savedDirectionIds.includes(selected.id)} onClick={() => void action('save', selected.id)}>{session.savedDirectionIds.includes(selected.id) ? '已保存至会话成果' : '保存至会话成果'}</button><button className={`${button} bg-primary text-text-inverse hover:text-text-inverse`} disabled={!!running || mutating} onClick={() => void action('handoff', selected.id)}>保存并在工作台打开 →</button></div></section>}
      </>}
      {error && <div role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"><p>{error}</p>{id && <button className="mt-2 text-xs underline" onClick={() => { setError(''); void refresh().catch(cause => setError(cause.message)); }}>重新读取状态</button>}</div>}
      {session && !session.run && !streaming && <button className={`${button} mt-5`} onClick={() => void run()}>开始处理这条需求</button>}
    </div>
    {session && <footer className="sticky bottom-0 z-10 border-t border-text/10 bg-bg/95 px-5 pb-3 pt-4 backdrop-blur"><div className="mx-auto max-w-4xl"><CoachInput compact conversation disabled={!!running || mutating} placeholder={running ? '正在处理本轮需求，可停止后继续讨论…' : focused ? `继续讨论「${focused.title}」，或提出新的调整要求…` : '继续追问、补充资料，或告诉我希望探索怎样的故事方向…'} onSubmit={(message, files, model) => run(message, files, model)} /><p className="text-center text-[10px] text-text-muted">讨论中的候选不会自动写入作品 · 选定与保存由你决定</p></div></footer>}
    {detail && session && <div className="fixed inset-0 z-40 flex justify-end bg-text/20" onClick={() => setDetail(null)}><aside ref={dialog} role="dialog" aria-modal="true" aria-label="成果与依据详情" className="h-full w-full max-w-2xl overflow-y-auto border-l border-text/10 bg-surface p-6 shadow-xl md:p-8" onClick={event => event.stopPropagation()}><div className="mb-6 flex items-center justify-between"><p className="text-xs tracking-widest text-text-muted">创作手记 / 依据与版本</p><button autoFocus className={button} onClick={() => setDetail(null)}>关闭 ×</button></div>
      {detail.type === 'source' && <><h2 className="font-serif text-2xl">{detail.source.name}</h2><p className="mt-2 text-xs text-text-muted">资料版本 {detail.source.version}</p><div className="mt-6 space-y-4">{detail.source.text.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean).map((paragraph, index) => <p key={index} id={`creation-paragraph-${index + 1}`} className={`whitespace-pre-wrap text-sm leading-7 ${detail.paragraph === index + 1 ? 'rounded-lg bg-accent/10 p-3' : ''}`}><span className="mr-3 text-xs text-text-muted">{index + 1}</span>{paragraph}</p>)}</div></>}
      {detail.type === 'report' && <><h2 className="font-serif text-2xl">{detail.report.scope}</h2><p className="mt-3 text-sm leading-6 text-text-muted">阅读覆盖：{detail.report.coverage}</p>{detail.report.limitations.length > 0 && <div className="mt-4 rounded-lg bg-accent/5 p-4 text-xs leading-6">范围与局限：{detail.report.limitations.join('；')}</div>}<ReportSearches report={detail.report} />{detail.report.findings.map((finding, index) => <section key={index} className="mt-7 border-t border-text/10 pt-5"><h3 className="font-serif text-lg">{finding.title}</h3><p className="mt-3 text-sm leading-7"><span className="text-text-muted">原文观察 · </span>{finding.observation}</p><p className="mt-2 text-sm leading-7"><span className="text-text-muted">机制解释 · </span>{finding.mechanism}</p>{finding.evidence.map((evidence, evidenceIndex) => { const source = session.sources.find(item => item.id === evidence.sourceId); return <blockquote key={evidenceIndex} className="mt-3 border-l-2 border-accent/30 bg-bg p-3 text-xs leading-6"><p>“{evidence.quote}”</p><button className="mt-1 text-accent underline" onClick={() => source && setDetail({ type: 'source', source, paragraph: evidence.paragraph })}>{source?.name || '来源不可用'} · 第 {evidence.paragraph} 段 →</button></blockquote>; })}{finding.knowledgeIds.map(knowledgeId => { const knowledge = detail.report.knowledge.find(item => item.id === knowledgeId); return knowledge ? <details key={knowledgeId} className="mt-3 rounded-lg border border-text/10 p-3"><summary className="cursor-pointer text-xs text-accent">参考方法：{knowledge.title}</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-6">{knowledge.text}</p><p className="mt-3 break-all text-[10px] text-text-muted">{knowledge.source} · 版本 {knowledge.version}</p></details> : null; })}</section>)}</>}
      {detail.type === 'direction' && <><h2 className="font-serif text-2xl">{detail.direction.title}</h2><p className="mt-2 text-xs text-text-muted">候选方向 · v{detail.direction.version}</p><dl className="mt-6 space-y-5">{[['故事核', detail.direction.premise], ['人物关系', detail.direction.characters], ['核心冲突', detail.direction.conflict], ['信息差或其他推进机制', detail.direction.informationGap], ['情绪落点', detail.direction.emotionalGoal], ['可迁移机制', detail.direction.mechanism], ['实质变化', detail.direction.changes], [detail.direction.material ? '系统新增的虚构设定' : '新增与待补设定', detail.direction.assumptions.join('；') || '未列出'], ['风险与取舍', detail.direction.risks.join('；') || '未列出']].map(([label, value]) => <div key={label}><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-7">{value}</dd></div>)}</dl><MaterialDetails direction={detail.direction} session={session} onDetail={setDetail} />{!!detail.direction.knowledge?.length && <section className="mt-6"><h3 className="text-xs text-text-muted">迁移机制的参考方法</h3>{detail.direction.knowledge.map(item => <details key={item.id} className="mt-3 rounded-lg border border-text/10 p-3"><summary className="cursor-pointer text-sm text-accent">{item.title}</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-6">{item.text}</p><p className="mt-3 break-all text-[10px] text-text-muted">{item.source} · 版本 {item.version}</p></details>)}</section>}{detail.direction.reportId && <button className={`${button} mt-5`} onClick={() => openReport(detail.direction.reportId!)}>查看关联拆解</button>}<div className="mt-7 border-t border-text/10 pt-5"><p className="mb-3 text-xs text-text-muted">同方向版本</p><div className="flex flex-wrap gap-2">{session.directions.filter(item => item.familyId === detail.direction.familyId).map(item => <button key={item.id} className={button} onClick={() => setDetail({ type: 'direction', direction: item })}>v{item.version} · {item.title}{item.id === session.selectedDirectionId ? '（已选定）' : ''}</button>)}</div></div></>}
    </aside></div>}
  </main>;
}
