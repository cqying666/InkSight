/**
 * InkSight 拆文+人设分析管线
 *
 * 并行执行两个分析：
 * 1. 短篇精准拆文（plotAnalysis）
 * 2. 短篇人设提取（characterAnalysis）
 *
 * 降级策略：
 * - 单个分析失败 → 标记 error，另一个仍可用
 * - 两个都失败 → 抛出错误
 */

import { z } from "zod";
import { callLLMWithSchema } from "../llm/client";
import {
  PlotAnalysisSchema,
  CharacterAnalysisSchema,
  validatePlotAnalysis,
  validateCharacterAnalysis,
  type PlotAnalysis,
  type CharacterAnalysis,
} from "./schema";
import { PLOT_ANALYSIS_PROMPT, CHARACTER_ANALYSIS_PROMPT } from "./prompts";

// ===== 输入 Schema =====

export const AnalysisInputSchema = z.object({
  text: z
    .string()
    .min(100, "小说文本过短，至少 100 字")
    .max(50_000, "上限 50000 字"),
  fileName: z.string().optional(),
});

export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;

/**
 * 从文件名推导标题（去掉扩展名）。
 * "粘贴文本" 等非文件名输入返回 null。
 */
function deriveTitleFromFileName(fileName?: string): string | null {
  if (!fileName || !fileName.trim()) return null;
  const trimmed = fileName.trim();
  if (trimmed === "粘贴文本") return null;
  const dotIdx = trimmed.lastIndexOf(".");
  const base = dotIdx > 0 ? trimmed.slice(0, dotIdx) : trimmed;
  return base.trim() || null;
}

// ===== 分析结果类型 =====

export interface AnalysisResult {
  /** 拆文分析结果 */
  plot: {
    status: "loaded" | "error";
    data?: PlotAnalysis;
    error?: string;
    durationMs?: number;
  };
  /** 人设分析结果 */
  character: {
    status: "loaded" | "error";
    data?: CharacterAnalysis;
    error?: string;
    durationMs?: number;
  };
  /** 元信息 */
  meta: {
    totalMs: number;
    tokens: number;
    degraded: boolean;
    degradeReason?: string;
  };
}

// ===== 单个分析函数 =====

async function runPlotAnalysis(
  novelText: string,
  timeoutMs: number
): Promise<{
  data: PlotAnalysis;
  durationMs: number;
  tokens: number;
}> {
  const { data, raw } = await callLLMWithSchema({
    systemPrompt: PLOT_ANALYSIS_PROMPT.system,
    userPrompt: PLOT_ANALYSIS_PROMPT.user(novelText),
    temperature: 0.3,
    jsonMode: true,
    maxAttempts: 2,
    timeout: timeoutMs,
    feature: "analysis",
    validate: (parsed) => validatePlotAnalysis(parsed),
  });

  return {
    data,
    durationMs: raw.durationMs,
    tokens: raw.usage.totalTokens,
  };
}

async function runCharacterAnalysis(
  novelText: string,
  timeoutMs: number
): Promise<{
  data: CharacterAnalysis;
  durationMs: number;
  tokens: number;
}> {
  const { data, raw } = await callLLMWithSchema({
    systemPrompt: CHARACTER_ANALYSIS_PROMPT.system,
    userPrompt: CHARACTER_ANALYSIS_PROMPT.user(novelText),
    temperature: 0.3,
    jsonMode: true,
    maxAttempts: 2,
    timeout: timeoutMs,
    maxTokens: 16384,
    feature: "analysis",
    validate: (parsed) => validateCharacterAnalysis(parsed),
  });

  return {
    data,
    durationMs: raw.durationMs,
    tokens: raw.usage.totalTokens,
  };
}

// ===== 通用 race timeout =====

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ===== 主管线函数 =====

/**
 * 执行拆文+人设分析（并行）
 *
 * @param input 小说文本
 * @param options.timeout 单个分析的超时毫秒数（默认 300000 = 5 分钟）
 */
export async function runAnalysisPipeline(
  input: AnalysisInput,
  options: {
    timeout?: number;
  } = {}
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const { timeout = 300_000 } = options;

  let totalTokens = 0;
  let degraded = false;
  let degradeReason: string | undefined;

  // 并行执行两个分析
  const [plotResult, characterResult] = await Promise.allSettled([
    withTimeout(runPlotAnalysis(input.text, timeout), timeout, "拆文分析"),
    withTimeout(
      runCharacterAnalysis(input.text, timeout),
      timeout,
      "人设分析"
    ),
  ]);

  // 处理拆文结果
  let plot: AnalysisResult["plot"];
  if (plotResult.status === "fulfilled") {
    plot = {
      status: "loaded",
      data: plotResult.value.data,
      durationMs: plotResult.value.durationMs,
    };
    totalTokens += plotResult.value.tokens;
  } else {
    plot = {
      status: "error",
      error: plotResult.reason instanceof Error ? plotResult.reason.message : String(plotResult.reason),
    };
    degraded = true;
    degradeReason = `拆文分析失败: ${plot.error}`;
  }

  // 处理人设结果
  let character: AnalysisResult["character"];
  if (characterResult.status === "fulfilled") {
    character = {
      status: "loaded",
      data: characterResult.value.data,
      durationMs: characterResult.value.durationMs,
    };
    totalTokens += characterResult.value.tokens;
  } else {
    character = {
      status: "error",
      error: characterResult.reason instanceof Error ? characterResult.reason.message : String(characterResult.reason),
    };
    degraded = true;
    degradeReason = degradeReason
      ? `${degradeReason}; 人设分析失败: ${character.error}`
      : `人设分析失败: ${character.error}`;
  }

  // 两个都失败是致命的
  if (plot.status === "error" && character.status === "error") {
    throw new Error(degradeReason || "拆文和人设分析均失败");
  }

  // 用真实文件名覆盖 LLM 推断的标题
  const titleFromFileName = deriveTitleFromFileName(input.fileName);
  if (titleFromFileName) {
    if (plot.status === "loaded" && plot.data) {
      plot.data.editorView.basicInfo.title = titleFromFileName;
      plot.data.masterTable.bookName = titleFromFileName;
    }
    if (character.status === "loaded" && character.data) {
      character.data.characterList.bookName = titleFromFileName;
    }
  }

  const totalMs = Date.now() - startTime;

  return {
    plot,
    character,
    meta: {
      totalMs,
      tokens: totalTokens,
      degraded,
      degradeReason,
    },
  };
}
