import type { AnalysisResult } from "../analysis/pipeline";

/**
 * 跨页传递分析结果（upload → analyzing → report）
 *
 * 用 sessionStorage 承载 AnalysisResult，避免在 URL 暴露大 JSON。
 * 报告页读取失败（无数据/解析失败）时回退到 mock，保证可独立演示。
 */

const KEY = "inksight:analysis";
const PARAGRAPHS_KEY = "inksight:paragraphs";
const REPORT_ID_KEY = "inksight:analysis:report-id";

function stableLegacyReportId(raw: string): string {
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index++) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-report-${(hash >>> 0).toString(36)}`;
}

export function saveAnalysis(
  result: AnalysisResult,
  paragraphs: string[],
  reportId = `report-${Date.now()}`
): string {
  if (typeof window === "undefined") return reportId;

  const clearAll = () => {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(PARAGRAPHS_KEY);
    sessionStorage.removeItem(REPORT_ID_KEY);
  };

  const trySave = (para: string[]): boolean => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(result));
      sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify(para));
      sessionStorage.setItem(REPORT_ID_KEY, reportId);
      return true;
    } catch {
      clearAll();
      return false;
    }
  };

  if (trySave(paragraphs)) return reportId;
  if (trySave(paragraphs.slice(0, 50))) return reportId;
  if (trySave(paragraphs.slice(0, 10))) return reportId;

  try {
    sessionStorage.setItem(KEY, JSON.stringify(result));
    sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify([]));
    sessionStorage.setItem(REPORT_ID_KEY, reportId);
  } catch {
    clearAll();
  }

  return reportId;
}

export function loadAnalysis(): {
  analysis: AnalysisResult;
  paragraphs: string[];
  reportId: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  const rawPara = sessionStorage.getItem(PARAGRAPHS_KEY);
  if (!raw || !rawPara) return null;
  try {
    let reportId = sessionStorage.getItem(REPORT_ID_KEY);
    if (!reportId) {
      reportId = stableLegacyReportId(raw);
      sessionStorage.setItem(REPORT_ID_KEY, reportId);
    }
    return {
      analysis: JSON.parse(raw) as AnalysisResult,
      paragraphs: JSON.parse(rawPara) as string[],
      reportId,
    };
  } catch {
    return null;
  }
}

export function clearAnalysis() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(PARAGRAPHS_KEY);
  sessionStorage.removeItem(REPORT_ID_KEY);
}

/**
 * 按段落切分原文（与分析的段落编号体系一致）
 * 简化策略：按空行切段落；连续非空行合并为一段。
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ===== 旧 API 兼容（逐步迁移） =====
// 保留旧函数名供 analyzing 页和其他引用过渡使用

export function saveFeedback(result: AnalysisResult, paragraphs: string[]) {
  return saveAnalysis(result, paragraphs);
}

export function loadFeedback(): {
  analysis: AnalysisResult;
  paragraphs: string[];
  reportId: string;
} | null {
  return loadAnalysis();
}

export function clearFeedback() {
  clearAnalysis();
}
