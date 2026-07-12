/**
 * 拆文历史持久化
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/teardown-history API）。
 * 所有 I/O 函数均为 async。
 */

import type { AnalysisResult } from "@/lib/analysis/pipeline";

export interface TeardownHistoryEntry {
  ts: string;
  type: string;
  title: string;
  summary: string;
  coreAttraction: string;
  reportId: string;
}

/**
 * 从 AnalysisResult 提取历史摘要条目（纯函数，同步）
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
export async function readTeardownHistory(): Promise<TeardownHistoryEntry[]> {
  try {
    const res = await fetch("/api/teardown-history");
    if (!res.ok) return [];
    const arr = await res.json();
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 追加一条拆文历史，自动 FIFO 截断
 */
export async function appendTeardownHistory(
  entry: TeardownHistoryEntry
): Promise<void> {
  try {
    await fetch("/api/teardown-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // 静默降级
  }
}

/**
 * 清空拆文历史
 */
export async function clearTeardownHistory(): Promise<void> {
  await fetch("/api/teardown-history", { method: "DELETE" });
}

/**
 * 统计作品类型频次，返回 Top N（纯函数，同步）
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
