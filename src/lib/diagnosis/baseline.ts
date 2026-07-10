import type { NovelTypeValue } from "../teardown/schema";

/**
 * 基准数据模型 (P1-T1 / P3-T2)
 *
 * Phase 1 阶段使用预设基准值（基于短篇小说创作经验）。
 * Phase 3 起：优先加载 data/baseline.json（由 scripts/aggregate-baseline.ts
 * 从 100 篇预拆语料聚合），失败/未生成时回退到下方硬编码经验值。
 *
 * 真实 100 篇到位后只需重跑 aggregate-baseline.ts，无需改代码。
 *
 * 每个维度记录：均值(mean) 与标准差(std)
 * 诊断时用 z-score = (用户值 - 均值) / 标准差 判断偏离程度
 */

export interface MetricBaseline {
  mean: number;
  std: number;
  /** 方向：higher=越高越好，lower=越低越好，neutral=中性（依类型而定） */
  direction: "higher" | "lower" | "neutral";
  /** 简短描述（用于诊断报告） */
  label: string;
}

export interface TypeBaseline {
  /** 维度路径 → 基准 */
  metrics: Record<string, MetricBaseline>;
}

// ===== 聚合基准加载（P3-T2）=====

interface AggregatedMetric {
  mean: number;
  std: number;
  p25: number;
  p50: number;
  p75: number;
  n: number;
}
interface AggregatedFile {
  generatedAt: string;
  totalSamples: number;
  byType: Record<string, number>;
  aggregations: Record<
    NovelTypeValue,
    { type: NovelTypeValue; sampleSize: number; metrics: Record<string, AggregatedMetric> }
  >;
}

// 维度方向与中文 label 元数据（聚合数据只含数值，方向/label 在此维护）
const METRIC_META: Record<
  string,
  { direction: "higher" | "lower" | "neutral"; label: string }
> = {
  "meta.wordCount": { direction: "neutral", label: "总字数" },
  "skeleton.hookStrength": { direction: "higher", label: "开头钩子强度" },
  "skeleton.eventDensity": { direction: "neutral", label: "事件密度（每千字）" },
  "skeleton.reversals_count": { direction: "higher", label: "反转数量" },
  "skeleton.threeActRatio.setup": { direction: "neutral", label: "建置段占比" },
  "skeleton.threeActRatio.confrontation": { direction: "higher", label: "对抗段占比" },
  "skeleton.threeActRatio.resolution": { direction: "neutral", label: "解决段占比" },
  "flesh.emotion_range_max": { direction: "higher", label: "情绪高峰" },
  "flesh.emotion_range_min": { direction: "lower", label: "情绪低谷" },
  "flesh.emotion_curve_points": { direction: "neutral", label: "情绪曲线点数" },
  "flesh.dialogueRatio": { direction: "neutral", label: "对话占比" },
  "flesh.narrationRatio": { direction: "neutral", label: "叙述占比" },
  "flesh.sensory_total": { direction: "higher", label: "感官描写总频率" },
  "flesh.characterArc_changePoint": { direction: "neutral", label: "人物变化节点位置" },
  "flesh.conflictLayers.interpersonal": { direction: "higher", label: "人际冲突占比" },
  "flesh.conflictLayers.internal": { direction: "higher", label: "内心冲突占比" },
  "flesh.conflictLayers.environmental": { direction: "neutral", label: "环境冲突占比" },
  "style.sentenceStyle.avgLength": { direction: "neutral", label: "平均句长（字）" },
  "style.sentenceStyle.shortSentenceRatio": { direction: "neutral", label: "短句占比" },
  "style.sentenceStyle.longSentenceRatio": { direction: "neutral", label: "长句占比" },
};

let cachedAggregated: AggregatedFile | null | undefined = undefined;

/**
 * 加载聚合基准文件。Node 端用 fs 同步读，浏览器端不支持（返回 null 回退硬编码）。
 * 仅在诊断引擎首次调用时读一次，结果缓存。
 */
function loadAggregated(): AggregatedFile | null {
  if (cachedAggregated !== undefined) return cachedAggregated;
  // 仅 Node 环境（CLI/脚本/API 路由）尝试读文件
  if (typeof window !== "undefined") {
    cachedAggregated = null;
    return null;
  }
  try {
    // 动态 require fs/path 避免浏览器 bundle 报错
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "data", "baseline.json");
    if (!fs.existsSync(file)) {
      cachedAggregated = null;
      return null;
    }
    const raw = fs.readFileSync(file, "utf-8");
    cachedAggregated = JSON.parse(raw) as AggregatedFile;
    return cachedAggregated;
  } catch {
    cachedAggregated = null;
    return null;
  }
}

// ===== 通用基准（所有类型共享的部分维度，硬编码回退）=====

const COMMON_METRICS: Record<string, MetricBaseline> = {
  "meta.wordCount": {
    mean: 3000,
    std: 1500,
    direction: "neutral",
    label: "总字数",
  },
  "skeleton.hookStrength": {
    mean: 3.5,
    std: 0.8,
    direction: "higher",
    label: "开头钩子强度",
  },
  "skeleton.eventDensity": {
    mean: 4,
    std: 1.5,
    direction: "neutral",
    label: "事件密度（每千字）",
  },
  "flesh.dialogueRatio": {
    mean: 0.35,
    std: 0.15,
    direction: "neutral",
    label: "对话占比",
  },
  "flesh.emotion_range_min": {
    mean: -3,
    std: 1.2,
    direction: "lower",
    label: "情绪低谷",
  },
  "flesh.emotion_range_max": {
    mean: 3,
    std: 1.2,
    direction: "higher",
    label: "情绪高峰",
  },
  "style.sentenceStyle.avgLength": {
    mean: 25,
    std: 8,
    direction: "neutral",
    label: "平均句长（字）",
  },
};

// ===== 按类型差异化基准 =====

export const TYPE_BASELINES: Record<NovelTypeValue, TypeBaseline> = {
  // 情节驱动型：反转密集、节奏快
  "plot-driven": {
    metrics: {
      ...COMMON_METRICS,
      "skeleton.hookStrength": {
        mean: 4,
        std: 0.7,
        direction: "higher",
        label: "开头钩子强度",
      },
      "skeleton.eventDensity": {
        mean: 5.5,
        std: 1.5,
        direction: "higher",
        label: "事件密度（每千字）",
      },
      "skeleton.reversals_count": {
        mean: 2,
        std: 0.8,
        direction: "higher",
        label: "反转数量",
      },
      "skeleton.threeActRatio.confrontation": {
        mean: 0.55,
        std: 0.1,
        direction: "higher",
        label: "对抗段占比",
      },
      "flesh.conflictLayers.interpersonal": {
        mean: 0.55,
        std: 0.15,
        direction: "higher",
        label: "人际冲突占比",
      },
      "flesh.emotion_range_max": {
        mean: 3.5,
        std: 1,
        direction: "higher",
        label: "情绪高峰",
      },
    },
  },

  // 情感驱动型：内心描写多、情绪起伏大
  "emotion-driven": {
    metrics: {
      ...COMMON_METRICS,
      "flesh.emotion_range_max": {
        mean: 3.5,
        std: 1,
        direction: "higher",
        label: "情绪高峰",
      },
      "flesh.emotion_range_min": {
        mean: -3.5,
        std: 1,
        direction: "lower",
        label: "情绪低谷",
      },
      "flesh.characterArc_changePoint": {
        mean: 0.6,
        std: 0.1,
        direction: "neutral",
        label: "人物变化节点位置",
      },
      "flesh.conflictLayers.internal": {
        mean: 0.5,
        std: 0.15,
        direction: "higher",
        label: "内心冲突占比",
      },
      "flesh.dialogueRatio": {
        mean: 0.4,
        std: 0.15,
        direction: "neutral",
        label: "对话占比",
      },
      "flesh.sensory_total": {
        mean: 8,
        std: 3,
        direction: "higher",
        label: "感官描写总频率",
      },
    },
  },

  // 氛围驱动型：感官丰富、节奏舒缓
  "atmosphere-driven": {
    metrics: {
      ...COMMON_METRICS,
      "flesh.sensory_total": {
        mean: 12,
        std: 4,
        direction: "higher",
        label: "感官描写总频率",
      },
      "style.sentenceStyle.avgLength": {
        mean: 30,
        std: 10,
        direction: "neutral",
        label: "平均句长（字）",
      },
      "skeleton.eventDensity": {
        mean: 2.5,
        std: 1,
        direction: "lower",
        label: "事件密度（每千字）",
      },
      "flesh.emotion_range_max": {
        mean: 2,
        std: 1,
        direction: "neutral",
        label: "情绪高峰",
      },
      "flesh.dialogueRatio": {
        mean: 0.25,
        std: 0.1,
        direction: "neutral",
        label: "对话占比",
      },
    },
  },

  // 混合型：用通用基准
  mixed: {
    metrics: {
      ...COMMON_METRICS,
      "flesh.emotion_range_max": {
        mean: 3,
        std: 1.2,
        direction: "higher",
        label: "情绪高峰",
      },
      "flesh.emotion_range_min": {
        mean: -3,
        std: 1.2,
        direction: "lower",
        label: "情绪低谷",
      },
      "skeleton.reversals_count": {
        mean: 1.5,
        std: 0.8,
        direction: "neutral",
        label: "反转数量",
      },
    },
  },
};

// ===== 基准查询接口 =====

/**
 * 获取指定类型的基准数据。
 *
 * 优先级（P3-T2）：
 *  1. data/baseline.json 聚合结果（真实/合成语料统计）—— 仅 Node 端可用
 *  2. 下方 TYPE_BASELINES 硬编码经验值 —— 浏览器端/聚合未生成时回退
 *
 * 聚合基准覆盖全 19 维度（extractMetrics 产出），硬编码仅覆盖子集；
 * 两者按 metricPath 合并，聚合优先。
 */
export function getBaseline(type: NovelTypeValue): TypeBaseline {
  const fallback = TYPE_BASELINES[type] || TYPE_BASELINES.mixed;
  const agg = loadAggregated();
  if (!agg || !agg.aggregations[type]) return fallback;
  const aggType = agg.aggregations[type];
  if (aggType.sampleSize === 0) return fallback;

  // 合并：聚合基准 + 硬编码的方向/label 元数据
  const merged: Record<string, MetricBaseline> = { ...fallback.metrics };
  for (const [path, m] of Object.entries(aggType.metrics)) {
    const meta = METRIC_META[path] || { direction: "neutral", label: path };
    merged[path] = {
      mean: m.mean,
      // std 极小时（样本聚集）回退到硬编码 std，避免 z-score 爆炸
      std: m.std > 0.001 ? m.std : fallback.metrics[path]?.std ?? m.std,
      direction: meta.direction,
      label: meta.label,
    };
  }
  return { metrics: merged };
}

/**
 * 获取某个维度的基准
 */
export function getMetricBaseline(
  type: NovelTypeValue,
  metricPath: string
): MetricBaseline | null {
  const baseline = getBaseline(type);
  return baseline.metrics[metricPath] || null;
}

/**
 * 测试用：清除聚合基准缓存（强制重新读文件）
 */
export function _clearBaselineCacheForTest(): void {
  cachedAggregated = undefined;
}
