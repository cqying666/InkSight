/**
 * 创作工作台存储层
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/writing-documents API）。
 * 所有 I/O 函数均为 async。
 * 自动保存策略：每 30s + 失焦时保存
 *
 * 作品列表（works）：用户保存确认后归档，key="works"，data 为 WorkData[]
 */

const DOC_KEY = "draft";
const WORKS_KEY = "works";
const SAVE_INTERVAL_MS = 30_000;

export interface DraftData {
  id: string; // 稳定标识，首次保存时生成
  title: string;
  html: string;
  plainText: string;
  savedAt: number;
  completedAt?: number;
}

/** 作品数据（与草稿结构一致，归档后存入 works 列表） */
export type WorkData = DraftData;

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

// ===== 作品列表 CRUD =====

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

/** 新增或更新一条作品（按 id upsert） */
export async function upsertWork(work: WorkData): Promise<void> {
  const works = await loadWorks();
  const idx = works.findIndex((w) => w.id === work.id);
  if (idx >= 0) {
    works[idx] = work;
  } else {
    works.unshift(work);
  }
  await fetch("/api/writing-documents", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: WORKS_KEY, data: works }),
  });
}

/** 删除一条作品（按 id） */
export async function deleteWork(id: string): Promise<void> {
  const works = await loadWorks();
  const filtered = works.filter((w) => w.id !== id);
  await fetch("/api/writing-documents", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: WORKS_KEY, data: filtered }),
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
