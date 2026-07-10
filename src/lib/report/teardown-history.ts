/**
 * P6-T2 拆文历史持久化
 *
 * 背景：原 sessionStorage 只存最新一次 feedback，新拆解覆盖旧的，
 * 无法回溯用户拆过哪些作品 + 各次的薄弱点，导致 P6-T2 个性化推荐无据可依。
 *
 * 本模块用 localStorage 累积存"拆文历史摘要"（不含原文，仅类型 + 薄弱点 + 标题），
 * 上限 50 条 FIFO，单条 <1KB，总占用 <50KB。
 *
 * 与 Supabase 的关系：当前为本地轻量版，后端上线后只需把此 localStorage 迁移到
 * PostgreSQL 表（teardown_history），前端推荐逻辑零重构。
 */

import type { AnalysisResult } from "@/lib/analysis/pipeline";

const STORAGE_KEY = "inksight:teardown_history";
const MAX_ENTRIES = 50;

export interface TeardownHistoryEntry {
  /** 拆解时间戳 ISO */
  ts: string;
  /** 作品类型（从拆文分析 basicInfo.type 提取） */
  type: string;
  /** 作品标题 */
  title: string;
  /** 一句话总结 */
  summary: string;
  /** 核心吸引力 */
  coreAttraction: string;
  /** 拆文来源 reportId */
  reportId: string;
}

/**
 * 从 AnalysisResult 提取历史摘要条目
 */
export function buildHistoryEntry(
  analysis: AnalysisResult,
  title: string,
  reportId: string
): TeardownHistoryEntry {
  const plot = analysis.plot.status === "loaded" ? analysis.plot.data : null;

  return {
    ts: new Date().toISOString(),
    type: plot?.editorView.basicInfo.type ?? "未知类型",
    title: title.slice(0, 40),
    summary: plot?.editorView.basicInfo.oneLineSummary ?? "",
    coreAttraction: plot?.masterTable.coreAttraction ?? "",
    reportId,
  };
}

/**
 * 读取全部拆文历史（FIFO 顺序，最旧在前）
 */
export function readTeardownHistory(): TeardownHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * 追加一条拆文历史，自动 FIFO 截断到 MAX_ENTRIES
 */
export function appendTeardownHistory(
  entry: TeardownHistoryEntry
): TeardownHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const current = readTeardownHistory();
  const next = [...current, entry].slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 满或被禁用，静默降级
  }
  return next;
}

/**
 * 清空拆文历史（用户主动清除）
 */
export function clearTeardownHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默
  }
}

/**
 * 统计作品类型频次，返回 Top N
 * 用于个性化推荐
 */
export function aggregateWeakAreas(
  history: TeardownHistoryEntry[],
  topN = 3
): string[] {
  const counts = new Map<string, number>();
  for (const entry of history) {
    if (entry.type) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([label]) => label);
}
