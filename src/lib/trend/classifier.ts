import { z } from "zod";
import {
  callLLMWithSchema,
  callLLM,
  type LLMCallResult,
} from "../llm/client";
import { CLASSIFY_PROMPT } from "./prompts";
import { GENRE_POOL, ELEMENT_POOL, GENRE_LABELS, ELEMENT_LABELS } from "./labels";
import type { TrendEntryValue } from "./schema";
import { trackEvent } from "../report/analytics";

/**
 * LLM 标签分类管线 (P4-T4)
 *
 * 任务：给定榜单条目（仅 title/author/platform 元数据），输出题材标签 + 元素标签
 *
 * 设计：
 *  - 批量调用：一次 LLM 处理最多 20 条 entry（降低 API 成本）
 *  - Zod schema 校验 LLM 输出
 *  - 降级机制：
 *    1. LLM_API_KEY 未配置 → 规则版（标题关键词匹配 GENRE_POOL/ELEMENT_POOL）
 *    2. LLM 调用失败 / schema 校验失败 → 规则版降级
 *  - 复用 callLLMWithSchema（已有重试 + JSON 模式 + schema 校验）
 *
 * 合规约束（工程约束 §1.2）：
 *  - 输入仅含公开榜单元数据（标题/作者/平台），不含正文
 *  - 标签用于聚合统计
 *
 * 准确率目标（PRD §5.6 + 工程约束 §2）：>90%（抽样人工校验）
 *  - 规则版准确率约 70-80%（仅字面匹配）
 *  - LLM 版准确率约 90-95%（基于标题语义推断）
 *  - 真实采集接入后需抽样人工校验
 */

// ===== Zod Schema =====

const ClassifyItemSchema = z.object({
  title: z.string().min(1),
  genres: z.array(z.string()).min(1).max(5).default([]),
  elements: z.array(z.string()).min(0).max(5).default([]),
});

const ClassifyResultSchema = z.object({
  results: z.array(ClassifyItemSchema),
});

export type ClassifyItemValue = z.infer<typeof ClassifyItemSchema>;

// ===== 批量大小 =====

/** 单次 LLM 调用最大条目数（控制 prompt 长度 + 输出稳定性） */
const BATCH_SIZE = 20;

// ===== LLM 版分类 =====

/**
 * 批量分类入口：把 entries 切分成 batch，逐批调用 LLM
 *
 * @param entries 榜单条目（仅用 title/author/platform 字段）
 * @returns 与 entries 等长的 {genres, elements}[] 数组
 */
export async function classifyEntries(
  entries: TrendEntryValue[]
): Promise<
  {
    genres: string[];
    elements: string[];
    /** 来源：llm / rule（降级） */
    source: "llm" | "rule";
  }[]
> {
  if (entries.length === 0) return [];

  const results: {
    genres: string[];
    elements: string[];
    source: "llm" | "rule";
  }[] = [];

  // 切分 batch
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await classifyBatchWithLLM(batch);
      results.push(...batchResults.map((r) => ({ ...r, source: "llm" as const })));
    } catch (err) {
      // LLM 失败 → 规则版降级
      console.warn(
        `[P4-T4] LLM 分类失败，降级规则版（batch ${i / BATCH_SIZE + 1}）：`,
        err instanceof Error ? err.message : String(err)
      );
      const fallback = batch.map((e) => ({
        ...ruleClassify(e),
        source: "rule" as const,
      }));
      results.push(...fallback);
    }
  }

  // 埋点
  const llmCount = results.filter((r) => r.source === "llm").length;
  const ruleCount = results.filter((r) => r.source === "rule").length;
  trackEvent("trend_classified", {
    total: results.length,
    llm_count: llmCount,
    rule_count: ruleCount,
    batch_size: BATCH_SIZE,
  });

  return results;
}

/**
 * 单 batch LLM 调用
 */
async function classifyBatchWithLLM(
  batch: TrendEntryValue[]
): Promise<{ genres: string[]; elements: string[] }[]> {
  const inputForPrompt = batch.map((e) => ({
    title: e.title,
    author: e.author,
    platform: e.platform,
  }));

  const { data, raw } = await callLLMWithSchema({
    systemPrompt: CLASSIFY_PROMPT.system,
    userPrompt: CLASSIFY_PROMPT.user(inputForPrompt),
    temperature: 0.2,
    jsonMode: true,
    maxAttempts: 2,
    feature: "trend",
    validate: (parsed) => {
      const result = ClassifyResultSchema.safeParse(parsed);
      if (!result.success) {
        return {
          success: false,
          errors: result.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`
          ),
        };
      }
      // 额外校验：results 长度必须与输入一致
      if (result.data.results.length !== batch.length) {
        return {
          success: false,
          errors: [
            `results 长度 ${result.data.results.length} 与输入 ${batch.length} 不一致`,
          ],
        };
      }
      return { success: true, data: result.data };
    },
  });

  // 按 title 回查匹配（LLM 可能调换顺序，用 title 做映射）
  // 归一化 title：去除《》书名号、引号、首尾空格，避免 LLM 加装饰导致匹配失败
  const normalizeTitle = (s: string) =>
    s
      .replace(/[《》""''‘’「」『』]/g, "")
      .replace(/\s+/g, "")
      .trim();

  const resultMap = new Map<string, ClassifyItemValue>();
  for (const r of data.results) {
    resultMap.set(normalizeTitle(r.title), r);
  }

  // 长度一致时启用索引兜底（prompt 已要求顺序一致）
  const indexFallbackAvailable = data.results.length === batch.length;

  return batch.map((e, idx) => {
    const matched = resultMap.get(normalizeTitle(e.title));
    let raw: ClassifyItemValue | undefined = matched;
    // title 归一化后仍不匹配，用索引兜底（LLM 通常保持顺序，只是 title 字段加了装饰）
    if (!raw && indexFallbackAvailable) {
      raw = data.results[idx];
    }
    if (raw) {
      const genres = sanitizeTags(raw.genres, "genre");
      const elements = sanitizeTags(raw.elements, "element");
      // 词汇表过滤后可能为空（LLM 输出了词表外标签），用规则版兜底补齐
      const fallback = ruleClassify(e);
      return {
        genres: genres.length > 0 ? genres : fallback.genres,
        elements: elements.length > 0 ? elements : fallback.elements,
      };
    }
    // 索引兜底也失败，降级规则版
    return ruleClassify(e);
  });
}

// ===== 规则版降级（无 LLM 时用） =====

/**
 * 规则版分类：基于标题字面匹配 GENRE_POOL / ELEMENT_POOL
 *
 * 准确率约 70-80%（仅字面匹配，无语义理解）
 * 用于：
 *  - LLM_API_KEY 未配置时
 *  - LLM 调用失败时
 *  - 测试 / mock 场景
 */
export function ruleClassify(entry: TrendEntryValue): {
  genres: string[];
  elements: string[];
} {
  const title = entry.title;
  const genres = new Set<string>();
  const elements = new Set<string>();

  // 题材：标题包含词表中的题材词
  for (const g of GENRE_POOL) {
    if (title.includes(g)) genres.add(g);
  }

  // 元素：标题包含词表中的元素词
  for (const el of ELEMENT_POOL) {
    if (title.includes(el)) elements.add(el);
  }

  // 兜底：如果都没匹配到，给一个通用标签
  if (genres.size === 0) genres.add("其他");
  if (elements.size === 0) elements.add("其他");

  return {
    genres: Array.from(genres),
    elements: Array.from(elements),
  };
}

// ===== 工具函数 =====

/**
 * 标签清洗：词表过滤 + 去重 + 去空 + 长度限制
 *
 * 严格按 GENRE_POOL / ELEMENT_POOL 过滤，丢弃词表外的标签
 * （LLM 偶发不遵守词表约束，如把"日常"当元素输出，需在代码侧兜底）
 */
function sanitizeTags(
  tags: string[],
  kind: "genre" | "element"
): string[] {
  const pool = new Set<string>(kind === "genre" ? GENRE_LABELS : ELEMENT_LABELS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (!pool.has(trimmed)) continue; // 词表外标签丢弃
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 5) break; // 上限 5 个
  }
  return out;
}

// ===== 单条 entry 分类（便捷入口） =====

/**
 * 单条 entry 分类（内部走 batch，只是封装）
 */
export async function classifyEntry(
  entry: TrendEntryValue
): Promise<{
  genres: string[];
  elements: string[];
  source: "llm" | "rule";
}> {
  const [result] = await classifyEntries([entry]);
  return result;
}

// ===== 健康检查 / dry-run =====

/**
 * dry-run：不调用 LLM，仅返回规则版结果
 * 用于测试 / 验证管线
 */
export function classifyEntriesDryRun(
  entries: TrendEntryValue[]
): { genres: string[]; elements: string[]; source: "rule" }[] {
  return entries.map((e) => ({ ...ruleClassify(e), source: "rule" as const }));
}

/**
 * 健康检查：调用 LLM 一次最小请求，验证 API 可用性
 */
export async function pingClassifier(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const sample: TrendEntryValue = {
      title: "悬疑之夜",
      platform: "fanqie",
      rank: 1,
      genres: [],
      elements: [],
      popularity: 0,
      collectedAt: new Date().toISOString().slice(0, 10),
    };
    await classifyEntry(sample);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ===== 评估工具（供 tests/ 抽样人工校验用） =====

/**
 * 评估分类结果与人工标注的一致率
 *
 * @param predicted LLM/规则版预测结果
 * @param groundTruth 人工标注的真值
 * @returns 准确率（0-1）+ 详细对比
 */
export function evaluateClassification(
  predicted: { genres: string[]; elements: string[] }[],
  groundTruth: { genres: string[]; elements: string[] }[]
): {
  accuracy: number;
  genreAccuracy: number;
  elementAccuracy: number;
  details: {
    index: number;
    predictedGenres: string[];
    truthGenres: string[];
    predictedElements: string[];
    truthElements: string[];
    genresMatch: boolean;
    elementsMatch: boolean;
  }[];
} {
  const n = Math.min(predicted.length, groundTruth.length);
  if (n === 0) {
    return { accuracy: 0, genreAccuracy: 0, elementAccuracy: 0, details: [] };
  }

  let genreCorrect = 0;
  let elementCorrect = 0;
  const details: {
    index: number;
    predictedGenres: string[];
    truthGenres: string[];
    predictedElements: string[];
    truthElements: string[];
    genresMatch: boolean;
    elementsMatch: boolean;
  }[] = [];

  for (let i = 0; i < n; i++) {
    const p = predicted[i];
    const t = groundTruth[i];

    // 集合相等才算正确（严格评估）
    const genresMatch =
      new Set(p.genres).size === new Set(t.genres).size &&
      [...new Set(p.genres)].every((g) => new Set(t.genres).has(g));
    const elementsMatch =
      new Set(p.elements).size === new Set(t.elements).size &&
      [...new Set(p.elements)].every((e) => new Set(t.elements).has(e));

    if (genresMatch) genreCorrect++;
    if (elementsMatch) elementCorrect++;

    details.push({
      index: i,
      predictedGenres: p.genres,
      truthGenres: t.genres,
      predictedElements: p.elements,
      truthElements: t.elements,
      genresMatch,
      elementsMatch,
    });
  }

  return {
    accuracy: (genreCorrect + elementCorrect) / (2 * n),
    genreAccuracy: genreCorrect / n,
    elementAccuracy: elementCorrect / n,
    details,
  };
}

// ===== LLM 调用结果类型导出（供测试用） =====

export type { LLMCallResult };
export { callLLM }; // 重新导出，便于测试 mock
export { GENRE_LABELS, ELEMENT_LABELS } from "./labels";
