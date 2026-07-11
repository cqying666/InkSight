/**
 * P5-T1 创作工作台存储层
 *
 * 自动保存策略：每 30s + 失焦时保存
 * 存储到 localStorage，键名 inksight:write:draft
 */

const STORAGE_KEY = "inksight:write:draft";
const SAVE_INTERVAL_MS = 30_000;

export interface DraftData {
  title: string;
  html: string; // 编辑器富文本内容
  plainText: string; // 纯文本（用于字数统计和写后分析）
  savedAt: number; // 上次保存时间戳
  completedAt?: number; // 当前已保存版本的完成时间
}

/**
 * 加载草稿
 */
export function loadDraft(): DraftData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

/**
 * 保存草稿
 */
export function saveDraft(data: Omit<DraftData, "savedAt">): number {
  if (typeof window === "undefined") return 0;
  const savedAt = Date.now();
  const full: DraftData = { ...data, savedAt };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    return 0;
  }
  return savedAt;
}

/**
 * 清除草稿
 */
export function clearDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** 把当前已落盘草稿标记为完成，并复读确认 */
export function markDraftCompleted(): boolean {
  if (typeof window === "undefined") return false;
  const draft = loadDraft();
  if (!draft) return false;
  try {
    const completedAt = Date.now();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...draft, completedAt })
    );
    return loadDraft()?.completedAt === completedAt;
  } catch {
    return false;
  }
}

/**
 * 格式化保存时间为可读字符串
 */
export function formatSavedAt(savedAt: number | null): string {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export { SAVE_INTERVAL_MS, STORAGE_KEY };
