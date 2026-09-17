/**
 * 创作工作台存储层
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/writing-documents API）。
 * 所有 I/O 函数均为 async。
 * 自动保存策略：每 30s + 失焦时保存
 *
 * 作品列表（works）：用户保存确认后归档，key="works"，data 为 WorkData[]
 */

import type { WorkspaceDocuments } from "./documents";
import type { Sale } from "./sale";

const DOC_KEY = "draft";
const WORKS_KEY = "works";
const SAVE_INTERVAL_MS = 30_000;

// 互斥锁：防止多个写操作并发执行导致读-改-写竞态（数据丢失）
let _worksMutex: Promise<void> = Promise.resolve();
function withWorksLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _worksMutex;
  let resolve!: () => void;
  _worksMutex = new Promise<void>((r) => { resolve = r; });
  return prev.then(() => fn()).finally(resolve);
}

export interface DraftData {
  id: string; // 稳定标识，首次保存时生成
  title: string;
  html: string;
  plainText: string;
  savedAt: number;
  completedAt?: number;
}

/** 作品数据（草稿结构 + 每篇作品独立的参考文档 + 售出信息） */
export interface WorkData extends DraftData {
  /** 该作品对应的对标文/大纲/细纲/人物小传，编辑时随作品一起保存 */
  documents?: WorkspaceDocuments;
  /** 售出信息（未标记售出时为 undefined） */
  sale?: Sale;
}

/**
 * 加载草稿
 */
export async function loadDraft(): Promise<DraftData | null> {
  try {
    const res = await fetch(`/api/writing-documents?key=${DOC_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    return data as DraftData;
  } catch {
    return null;
  }
}

/**
 * 保存草稿（首次保存自动生成 id）
 */
export async function saveDraft(
  data: Omit<DraftData, "savedAt" | "id"> & { id?: string }
): Promise<{ savedAt: number; id: string }> {
  const savedAt = Date.now();
  const id = data.id || generateId();
  const full: DraftData = { ...data, id, savedAt };
  try {
    await fetch("/api/writing-documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: DOC_KEY, data: full }),
    });
  } catch {
    // 静默
  }
  return { savedAt, id };
}

/**
 * 清除草稿
 */
export async function clearDraft(): Promise<void> {
  await fetch(`/api/writing-documents?key=${DOC_KEY}`, { method: "DELETE" });
}

/** 把当前已落盘草稿标记为完成，并归档到作品列表 */
export async function markDraftCompleted(): Promise<boolean> {
  const draft = await loadDraft();
  if (!draft) return false;
  const completedAt = Date.now();
  const updated: DraftData = { ...draft, completedAt };
  try {
    // 1. 更新草稿状态
    await fetch("/api/writing-documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: DOC_KEY, data: updated }),
    });
    // 2. 归档到作品列表
    await upsertWork(updated);
    return true;
  } catch {
    return false;
  }
}

// ===== 作品列表 CRUD（服务端合并，防止多标签页竞态） =====

/** 加载所有作品（按完成时间倒序） */
export async function loadWorks(): Promise<WorkData[]> {
  try {
    const res = await fetch(`/api/writing-documents?key=${WORKS_KEY}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as WorkData[]).sort((a, b) => {
      const ta = a.completedAt ?? a.savedAt;
      const tb = b.completedAt ?? b.savedAt;
      return tb - ta;
    });
  } catch {
    return [];
  }
}

async function postWorksOps(ops: Array<Record<string, unknown>>): Promise<void> {
  const res = await fetch("/api/writing-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `操作失败 (${res.status})`);
  }
}

/** 新增或更新一条作品（按 id upsert，服务端合并） */
export async function upsertWork(work: WorkData): Promise<void> {
  return withWorksLock(async () => {
    await postWorksOps([{ op: "upsert", work }]);
  });
}

/** 删除一条作品（按 id，服务端合并） */
export async function deleteWork(id: string): Promise<void> {
  return withWorksLock(async () => {
    await postWorksOps([{ op: "delete", workId: id }]);
  });
}

/**
 * 仅更新某条作品的参考文档（对标文/大纲/细纲/人物小传）
 * 服务端合并，保留其他字段不变
 */
export async function updateWorkDocuments(
  workId: string,
  documents: WorkspaceDocuments
): Promise<void> {
  return withWorksLock(async () => {
    await postWorksOps([{ op: "updateDocuments", workId, documents }]);
  });
}

/**
 * 更新某条作品的售出信息
 * 服务端合并，保留其他字段不变
 */
export async function updateWorkSale(
  workId: string,
  sale: Sale
): Promise<void> {
  return withWorksLock(async () => {
    await postWorksOps([{ op: "updateSale", workId, sale }]);
  });
}

/**
 * 取消某条作品的售出标记（移除 sale 字段）
 * 服务端合并
 */
export async function clearWorkSale(workId: string): Promise<void> {
  return withWorksLock(async () => {
    await postWorksOps([{ op: "clearSale", workId }]);
  });
}

// ===== 工具函数 =====

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * 格式化保存时间为可读字符串（纯函数）
 */
export function formatSavedAt(savedAt: number | null): string {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export { SAVE_INTERVAL_MS };
