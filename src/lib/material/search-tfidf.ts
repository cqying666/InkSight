import type { Material } from "./schema";
import type { ComponentKindValue } from "./schema";
import type { NovelTypeValue } from "../teardown/schema";

/**
 * TF-IDF 语义搜索降级实现 (P4-T11)
 *
 * 嵌入模型未选型前的降级方案（PRD §6.3 允许"语义搜索超时 → 关键词搜索"）：
 *  - 用 TF-IDF + 余弦相似度做语义搜索的降级
 *  - 中文分词用简易 N-gram（2-gram + 3-gram）+ 字符级，避免引入 jieba 重依赖
 *  - 索引在内存构建，每次查询时计算（MVP 规模够用）
 *
 * P4-T12 扩展：支持类型/情绪/结构三维筛选
 *  - novelType     类型维度：按来源作品类型筛选（origin.type）
 *  - emotionShape  情绪维度：按情绪曲线形状筛选（仅 emotion_curve 组件）
 *  - componentKind 结构维度：按组件子类型筛选（component.kind）
 *
 * 后续迭代：
 *  - 替换为真实嵌入模型（智谱 embedding-3 / OpenAI text-embedding-3-small）
 *  - 接入 pgvector 持久化
 *  - 此文件作为降级分支保留（P4-T16 降级机制调用）
 */

// ===== 分词（简易中文 N-gram） =====

/**
 * 简易分词：英文按空格 + 中文按 2-gram/3-gram
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const cleaned = text.toLowerCase().replace(/[\s\n\r\t,。.!！?？;；:：""''""'()\[\]{}]/g, " ");

  // 英文/数字 token
  const enTokens = cleaned.match(/[a-z0-9]+/g) || [];
  tokens.push(...enTokens);

  // 中文字符序列
  const cnChunks = cleaned.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const chunk of cnChunks) {
    // 2-gram
    for (let i = 0; i < chunk.length - 1; i++) {
      tokens.push(chunk.slice(i, i + 2));
    }
    // 3-gram
    for (let i = 0; i < chunk.length - 2; i++) {
      tokens.push(chunk.slice(i, i + 3));
    }
    // 单字（兜底）
    for (const ch of chunk) tokens.push(ch);
  }

  return tokens;
}

// ===== TF-IDF 索引 =====

interface IndexedDoc {
  material: Material;
  tokens: string[];
  tf: Map<string, number>; // term frequency
  norm: number; // 向量模长
}

interface TfIdfIndex {
  docs: IndexedDoc[];
  df: Map<string, number>; // document frequency
  totalDocs: number;
}

/**
 * 从 Material 提取可索引文本
 */
function materialToText(m: Material): string {
  const parts: string[] = [];
  if (m.atom) {
    parts.push(m.atom.text);
    parts.push(m.atom.tags.join(" "));
  }
  if (m.component) {
    parts.push(m.component.summary);
    parts.push(m.component.tags.join(" "));
    if (m.component.excerpt) parts.push(m.component.excerpt);
    if (m.component.notes) parts.push(m.component.notes);
    // details 的值也纳入索引
    for (const v of Object.values(m.component.details)) {
      if (typeof v === "string") parts.push(v);
      else if (typeof v === "number") parts.push(String(v));
    }
  }
  if (m.inspiration) {
    parts.push(m.inspiration.title);
    parts.push(m.inspiration.text);
    parts.push(m.inspiration.tags.join(" "));
    if (m.inspiration.trendElement) parts.push(m.inspiration.trendElement);
  }
  return parts.join(" ");
}

/**
 * 构建 TF-IDF 索引
 */
export function buildIndex(materials: Material[]): TfIdfIndex {
  const docs: IndexedDoc[] = [];
  const df = new Map<string, number>();

  for (const m of materials) {
    const text = materialToText(m);
    const tokens = tokenize(text);
    const tf = new Map<string, number>();

    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    // 更新 DF
    for (const t of tf.keys()) {
      df.set(t, (df.get(t) || 0) + 1);
    }

    // 计算向量模长（用 TF，IDF 在查询时算）
    let norm = 0;
    for (const cnt of tf.values()) {
      norm += cnt * cnt;
    }
    norm = Math.sqrt(norm);

    docs.push({ material: m, tokens, tf, norm });
  }

  return { docs, df, totalDocs: docs.length };
}

// ===== 余弦相似度检索 =====

export interface SearchResult {
  material: Material;
  score: number; // 0-1
}

/**
 * 搜索/筛选选项（P4-T11 基础 + P4-T12 三维扩展）
 */
export interface SearchOpts {
  /** 层过滤 */
  layer?: "atom" | "component" | "inspiration";
  /** 来源过滤 */
  source?: "teardown" | "trend" | "manual" | "preset";
  /** P4-T12 类型维度：按来源作品类型筛选（origin.type） */
  novelType?: NovelTypeValue;
  /** P4-T12 情绪维度：按情绪曲线形状筛选（仅对 emotion_curve 组件生效） */
  emotionShape?: string;
  /** P4-T12 结构维度：按组件子类型筛选（component.kind） */
  componentKind?: ComponentKindValue;
  /** 返回 Top N，默认 20 */
  topN?: number;
  /** 最低相似度阈值，默认 0.05（仅 TF-IDF 搜索用） */
  minScore?: number;
}

/**
 * 统一筛选匹配（search + keywordFallback + 无查询筛选共用）
 *
 * 规则：
 *  - novelType：m.origin?.type 必须匹配（无 origin 或 type 不符则排除）
 *  - componentKind：m.component?.kind 必须匹配（非 component 层或 kind 不符则排除）
 *  - emotionShape：m.component.kind 必须为 emotion_curve，且 details.shape 必须匹配
 */
export function matchesFilters(m: Material, opts?: SearchOpts): boolean {
  if (!opts) return true;
  if (opts.layer && m.layer !== opts.layer) return false;
  if (opts.source && m.source !== opts.source) return false;
  if (opts.novelType && m.origin?.type !== opts.novelType) return false;
  if (opts.componentKind && m.component?.kind !== opts.componentKind) return false;
  if (opts.emotionShape) {
    // 仅 emotion_curve 组件有 shape 字段
    if (!m.component || m.component.kind !== "emotion_curve") return false;
    const shape = m.component.details?.shape;
    if (shape !== opts.emotionShape) return false;
  }
  return true;
}

/**
 * TF-IDF 余弦相似度搜索
 */
export function search(
  index: TfIdfIndex,
  query: string,
  opts?: SearchOpts
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || index.totalDocs === 0) return [];

  // 计算 query TF
  const queryTf = new Map<string, number>();
  for (const t of queryTokens) {
    queryTf.set(t, (queryTf.get(t) || 0) + 1);
  }

  // query 向量（TF-IDF）+ 模长
  const queryVec = new Map<string, number>();
  let queryNorm = 0;
  for (const [t, tf] of queryTf) {
    const df = index.df.get(t) || 0;
    if (df === 0) continue;
    const idf = Math.log((index.totalDocs + 1) / (df + 1)) + 1;
    const weight = tf * idf;
    queryVec.set(t, weight);
    queryNorm += weight * weight;
  }
  queryNorm = Math.sqrt(queryNorm);

  if (queryNorm === 0) return [];

  const topN = opts?.topN ?? 20;
  const minScore = opts?.minScore ?? 0.05;

  const results: SearchResult[] = [];

  for (const doc of index.docs) {
    // P4-T12 统一筛选
    if (!matchesFilters(doc.material, opts)) continue;

    // 计算点积（TF-IDF）
    let dot = 0;
    for (const [t, qw] of queryVec) {
      const tf = doc.tf.get(t);
      if (!tf) continue;
      const df = index.df.get(t) || 1;
      const idf = Math.log((index.totalDocs + 1) / (df + 1)) + 1;
      const dw = tf * idf;
      dot += qw * dw;
    }

    if (dot === 0) continue;
    const score = dot / (queryNorm * doc.norm);
    if (score >= minScore) {
      results.push({ material: doc.material, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

// ===== 降级路径（P4-T16 调用） =====

/**
 * 关键词搜索（TF-IDF 失败时的兜底，纯子串匹配）
 */
export function keywordFallback(
  materials: Material[],
  query: string,
  opts?: SearchOpts
): SearchResult[] {
  const topN = opts?.topN ?? 20;
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const m of materials) {
    // P4-T12 统一筛选
    if (!matchesFilters(m, opts)) continue;

    const text = materialToText(m).toLowerCase();
    // 子串匹配得分：出现次数
    let count = 0;
    let idx = text.indexOf(q);
    while (idx >= 0) {
      count += 1;
      idx = text.indexOf(q, idx + q.length);
    }

    if (count > 0) {
      // 简易得分：出现次数归一化
      const score = Math.min(1, count / 10);
      results.push({ material: m, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

// ===== P4-T12 筛选值枚举（供前端构建筛选 UI） =====

/** 作品类型中文标签 */
export const NOVEL_TYPE_LABEL: Record<NovelTypeValue, string> = {
  "plot-driven": "情节驱动型",
  "emotion-driven": "情感驱动型",
  "atmosphere-driven": "氛围驱动型",
  mixed: "混合型",
};

/** 情绪曲线形状预置列表（detectEmotionShape 输出的 8 种 + 兜底） */
export const EMOTION_SHAPES: string[] = [
  "先抑后扬型",
  "先扬后抑型",
  "持续高昂型",
  "持续压抑型",
  "V型反转",
  "倒V型",
  "剧烈波动型",
  "平稳曲线",
];

/**
 * 从素材集合中提取实际出现的筛选值（动态填充 UI）
 */
export function listFilterValues(materials: Material[]): {
  novelTypes: NovelTypeValue[];
  emotionShapes: string[];
  componentKinds: ComponentKindValue[];
} {
  const typeSet = new Set<NovelTypeValue>();
  const shapeSet = new Set<string>();
  const kindSet = new Set<ComponentKindValue>();

  for (const m of materials) {
    if (m.origin?.type) typeSet.add(m.origin.type);
    if (m.component?.kind === "emotion_curve" && m.component.details?.shape) {
      shapeSet.add(m.component.details.shape as string);
    }
    if (m.component?.kind) kindSet.add(m.component.kind);
  }

  return {
    novelTypes: Array.from(typeSet).sort(),
    emotionShapes: Array.from(shapeSet).sort(),
    componentKinds: Array.from(kindSet).sort(),
  };
}
