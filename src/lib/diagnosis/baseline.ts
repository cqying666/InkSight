import type { NovelTypeValue } from "../teardown/schema";

/**
 * 基准数据模型 (P1-T1)
 *
 * Phase 1 阶段使用预设基准值（基于短篇小说创作经验）
 * Phase 3 将用 100 篇预拆数据的真实统计值替换
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

// ===== 通用基准（所有类型共享的部分维度） =====

const COMMON_METRICS: Record<string, MetricBaseline> = {
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
  "flesh.emotionRange.min": {
    mean: -3,
    std: 1.2,
    direction: "lower",
    label: "情绪低谷",
  },
  "flesh.emotion_range_max" /* placeholder, replaced below */: {
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
 * 获取指定类型的基准数据
 */
export function getBaseline(type: NovelTypeValue): TypeBaseline {
  return TYPE_BASELINES[type] || TYPE_BASELINES.mixed;
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
