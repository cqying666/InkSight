import { z } from "zod";

/**
 * 趋势数据模型 Schema (P4-T3)
 *
 * 三层结构（PRD §5.5）：
 *  1. 榜单条目 TrendEntry  —— 每日采集的原始榜单行（标题/作者/平台/热度/排名）
 *  2. 趋势快照 TrendSnapshot —— 单日某平台的榜单聚合（含题材×元素矩阵）
 *  3. 元素趋势 ElementTrend —— 单个题材/元素的 30 天时间序列（生命周期标注用）
 *
 * 题材与元素标签：
 *  - genre    题材标签：悬疑/言情/治愈/复仇/重生/穿越/宫斗/日常/科幻…
 *  - element  元素标签：反转/虐心/甜宠/爽感/群像/悬念/系统/重生/复仇…
 *
 * 平台：fanqie / zhihu / qimao / dianzhong
 *
 * 生命周期四阶段（PRD §5.5 题材生命周期）：
 *  - emerging  萌芽期：热度快速上升但总量小
 *  - exploding 爆发期：热度高且仍在增长
 *  - plateau   平台期：热度高但增长放缓
 *  - declining 衰退期：热度持续下降
 */

// ===== 平台枚举 =====

export const Platform = z.enum([
  "fanqie", // 番茄短篇
  "zhihu", // 知乎盐选
  "qimao", // 七猫
  "dianzhong", // 点众
]);
export type PlatformValue = z.infer<typeof Platform>;

export const PLATFORM_LABEL: Record<PlatformValue, string> = {
  fanqie: "番茄短篇",
  zhihu: "知乎盐选",
  qimao: "七猫",
  dianzhong: "点众",
};

// ===== 生命周期 =====

export const LifecycleStage = z.enum([
  "emerging", // 萌芽期
  "exploding", // 爆发期
  "plateau", // 平台期
  "declining", // 衰退期
]);
export type LifecycleStageValue = z.infer<typeof LifecycleStage>;

export const LIFECYCLE_LABEL: Record<LifecycleStageValue, string> = {
  emerging: "萌芽期",
  exploding: "爆发期",
  plateau: "平台期",
  declining: "衰退期",
};

export const LIFECYCLE_ADVICE: Record<LifecycleStageValue, string> = {
  emerging: "最佳入场时机——竞争少，赛道在长大",
  exploding: "仍可入场，但需要差异化",
  plateau: "谨慎入场——除非有强差异化",
  declining: "不建议入场",
};

// ===== 第 1 层：榜单条目 =====

/**
 * 单篇作品在榜单上的一行
 * 不含正文，仅元数据（合规约束）
 */
export const TrendEntry = z.object({
  /** 作品标题 */
  title: z.string().min(1),
  /** 作者 */
  author: z.string().optional(),
  /** 平台 */
  platform: Platform,
  /** 榜单排名（1-based） */
  rank: z.number().int().positive(),
  /** 较前一日排名变化（正数=上升，负数=下降，0=不变，undefined=新上榜） */
  rankChange: z.number().int().optional(),
  /** 题材标签（LLM 辅助分类，可多个） */
  genres: z.array(z.string()).default([]),
  /** 元素标签（LLM 从标题/简介/评论提取，可多个） */
  elements: z.array(z.string()).default([]),
  /** 热度值（阅读/点赞/评论/收藏的加权综合分） */
  popularity: z.number().nonnegative(),
  /** 采集日期 ISO（YYYY-MM-DD） */
  collectedAt: z.string(),
});
export type TrendEntryValue = z.infer<typeof TrendEntry>;

// ===== 第 2 层：趋势快照（单日某平台聚合） =====

/**
 * 题材 × 元素 矩阵单元格
 * 热度 = 该组合在该快照内的 popularity 之和
 */
export const HeatmapCell = z.object({
  genre: z.string(),
  element: z.string(),
  /** 该组合的总热度 */
  heat: z.number().nonnegative(),
  /** 该组合的作品数 */
  count: z.number().int().nonnegative(),
});
export type HeatmapCellValue = z.infer<typeof HeatmapCell>;

/**
 * 单日某平台的趋势快照
 * 由若干 TrendEntry 聚合而成
 */
export const TrendSnapshot = z.object({
  /** 快照 ID（platform + date） */
  id: z.string(),
  platform: Platform,
  /** 采集日期 ISO */
  date: z.string(),
  /** 当日榜单所有条目 */
  entries: z.array(TrendEntry),
  /** 题材 × 元素 热力图矩阵 */
  heatmap: z.array(HeatmapCell),
  /** 当日出现的所有题材（去重） */
  genres: z.array(z.string()),
  /** 当日出现的所有元素（去重） */
  elements: z.array(z.string()),
  /** 采集时间戳 */
  collectedAt: z.string(),
  /** 数据源标记（真实采集 / mock / 降级旧数据） */
  source: z.enum(["real", "mock", "stale"]),
});
export type TrendSnapshotValue = z.infer<typeof TrendSnapshot>;

// ===== 第 3 层：元素时间序列（生命周期标注用） =====

/**
 * 单日某题材/元素的热度采样点
 */
export const TrendPoint = z.object({
  /** 采样日期 ISO */
  date: z.string(),
  /** 当日热度（跨平台聚合） */
  heat: z.number().nonnegative(),
  /** 当日作品数 */
  count: z.number().int().nonnegative(),
});
export type TrendPointValue = z.infer<typeof TrendPoint>;

/**
 * 单个题材或元素的 30 天时间序列
 * 用于生命周期标注 + 走势图
 */
export const ElementTrend = z.object({
  /** 题材或元素名 */
  name: z.string(),
  /** 类型：genre / element */
  kind: z.enum(["genre", "element"]),
  /** 30 天采样点 */
  series: z.array(TrendPoint),
  /** 当前生命周期阶段（基于 series 计算） */
  lifecycle: LifecycleStage,
  /** 近 7 天平均热度 */
  avgHeat7d: z.number().nonnegative(),
  /** 近 30 天平均热度 */
  avgHeat30d: z.number().nonnegative(),
  /** 趋势方向（近 7 天 vs 近 30 天均值对比） */
  direction: z.enum(["rising", "stable", "falling"]),
  /** 跨平台分布（平台 → 热度占比） */
  platformDistribution: z.record(Platform, z.number().nonnegative()),
});
export type ElementTrendValue = z.infer<typeof ElementTrend>;

// ===== 元素组合推荐（P4-T7 用） =====

/**
 * 代表作（仅标题+平台，不含正文）
 */
export const RepresentativeWork = z.object({
  title: z.string(),
  platform: Platform,
  rank: z.number().int().positive().optional(),
  popularity: z.number().nonnegative().optional(),
});

/**
 * 元素组合推荐条目
 */
export const CombinationRecommendation = z.object({
  /** 组合 ID */
  id: z.string(),
  /** 组合名称，如"悬疑+复仇+反转" */
  name: z.string(),
  /** 构成元素（题材 + 元素混合） */
  parts: z.array(z.string()),
  /** 近 7 天平均热度 */
  heat7d: z.number().nonnegative(),
  /** 趋势方向 */
  direction: z.enum(["rising", "stable", "falling"]),
  /** 生命周期阶段 */
  lifecycle: LifecycleStage,
  /** 代表作 Top 3 */
  representatives: z.array(RepresentativeWork).max(3),
  /** 结构特征摘要（从拆文数据库提取） */
  structureSummary: z.string().optional(),
});
export type CombinationRecommendationValue = z.infer<
  typeof CombinationRecommendation
>;

// ===== 校验器 =====

export function validateTrendEntry(data: unknown): {
  success: boolean;
  data?: TrendEntryValue;
  errors?: string[];
} {
  const result = TrendEntry.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }
  return { success: true, data: result.data };
}

export function validateTrendSnapshot(data: unknown): {
  success: boolean;
  data?: TrendSnapshotValue;
  errors?: string[];
} {
  const result = TrendSnapshot.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }
  return { success: true, data: result.data };
}

// ===== 生命周期算法（P4-T6 雏形） =====

/**
 * 基于时间序列计算生命周期阶段（PRD §5.5 题材生命周期表）
 *
 * 算法（可解释，基于热度趋势与总量）：
 *  - 计算近 7 天均值 h7、近 30 天均值 h30、近 7 天增长率 g7
 *  - 总量阈值 H：h30 全样本中位数
 *  - emerging:  h7 < H 但 g7 > 15%   （热度快速上升但总量小）
 *  - exploding: h7 >= H 且 g7 > 5%   （热度高且仍在增长）
 *  - plateau:   h7 >= H 且 |g7| <= 5% （热度高但增长放缓）
 *  - declining: g7 < -10%             （热度持续下降）
 *
 * @param series 30 天采样点（按 date 升序）
 * @returns 生命周期阶段
 */
export function computeLifecycle(
  series: TrendPointValue[]
): LifecycleStageValue {
  if (series.length < 7) return "emerging";

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const last30 = sorted.slice(-30);

  const avg = (arr: TrendPointValue[]) =>
    arr.reduce((s, p) => s + p.heat, 0) / arr.length;
  const h7 = avg(last7);
  const h30 = avg(last30);

  // 近 7 天增长率（末值 vs 首值）
  const first = last7[0].heat;
  const last = last7[last7.length - 1].heat;
  const g7 = first > 0 ? ((last - first) / first) * 100 : 0;

  // 总量阈值：用 30 天均值作为参考
  const H = h30;

  if (g7 < -10) return "declining";
  if (h7 >= H && g7 > 5) return "exploding";
  if (h7 >= H && Math.abs(g7) <= 5) return "plateau";
  if (h7 < H && g7 > 15) return "emerging";

  // 兜底：热度低且无增长，归萌芽
  if (h7 < H) return "emerging";
  return "plateau";
}

/**
 * 计算趋势方向（近 7 天 vs 近 30 天均值对比）
 */
export function computeDirection(
  series: TrendPointValue[]
): "rising" | "stable" | "falling" {
  if (series.length < 7) return "stable";
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const last30 = sorted.slice(-30);

  const avg = (arr: TrendPointValue[]) =>
    arr.reduce((s, p) => s + p.heat, 0) / arr.length;
  const h7 = avg(last7);
  const h30 = avg(last30);

  if (h30 === 0) return "stable";
  const ratio = h7 / h30;
  if (ratio > 1.1) return "rising";
  if (ratio < 0.9) return "falling";
  return "stable";
}
