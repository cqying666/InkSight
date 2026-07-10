import type { AnalysisResult } from "../analysis/pipeline";

/**
 * 跨页传递分析结果（upload → analyzing → report）
 *
 * 用 sessionStorage 承载 AnalysisResult，避免在 URL 暴露大 JSON。
 * 报告页读取失败（无数据/解析失败）时回退到 mock，保证可独立演示。
 */

const KEY = "inksight:analysis";
const PARAGRAPHS_KEY = "inksight:paragraphs";

export function saveAnalysis(result: AnalysisResult, paragraphs: string[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(result));
    sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify(paragraphs));
  } catch {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(PARAGRAPHS_KEY);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(result));
      sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify(paragraphs));
    } catch {
      // 数据过大，压缩 paragraphs
      try {
        const trimmedParagraphs = paragraphs.slice(0, 50);
        sessionStorage.setItem(KEY, JSON.stringify(result));
        sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify(trimmedParagraphs));
      } catch {
        // 最后降级：丢弃 paragraphs
        sessionStorage.setItem(KEY, JSON.stringify(result));
        sessionStorage.setItem(PARAGRAPHS_KEY, JSON.stringify(paragraphs.slice(0, 10)));
      }
    }
  }
}

export function loadAnalysis(): {
  analysis: AnalysisResult;
  paragraphs: string[];
} | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  const rawPara = sessionStorage.getItem(PARAGRAPHS_KEY);
  if (!raw || !rawPara) return null;
  try {
    return {
      analysis: JSON.parse(raw) as AnalysisResult,
      paragraphs: JSON.parse(rawPara) as string[],
    };
  } catch {
    return null;
  }
}

export function clearAnalysis() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(PARAGRAPHS_KEY);
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
  saveAnalysis(result, paragraphs);
}

export function loadFeedback(): {
  analysis: AnalysisResult;
  paragraphs: string[];
} | null {
  return loadAnalysis();
}

export function clearFeedback() {
  clearAnalysis();
}
