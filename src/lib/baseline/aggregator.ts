import type { TeardownResult, NovelTypeValue } from "../teardown/schema";

/**
 * 指标提取 (P3-T2，从 diagnosis/engine.ts 抽出共享)
 *
 * 把 TeardownResult 中所有数值型维度拍平为 {path, value} 列表。
 * 诊断引擎与基准库聚合器共用同一份提取逻辑，避免漂移。
 */

export interface ExtractedMetric {
  path: string;
  value: number;
}

export function extractMetrics(teardown: TeardownResult): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = [];

  // 元信息
  metrics.push({ path: "meta.wordCount", value: teardown.wordCount });

  // 骨架层
  metrics.push({ path: "skeleton.hookStrength", value: teardown.skeleton.hookStrength });
  metrics.push({ path: "skeleton.eventDensity", value: teardown.skeleton.eventDensity });
  metrics.push({ path: "skeleton.reversals_count", value: teardown.skeleton.reversals.length });
  metrics.push({ path: "skeleton.threeActRatio.setup", value: teardown.skeleton.threeActRatio.setup });
  metrics.push({
    path: "skeleton.threeActRatio.confrontation",
    value: teardown.skeleton.threeActRatio.confrontation,
  });
  metrics.push({
    path: "skeleton.threeActRatio.resolution",
    value: teardown.skeleton.threeActRatio.resolution,
  });

  // 血肉层
  metrics.push({ path: "flesh.emotion_range_max", value: teardown.flesh.emotionRange.max });
  metrics.push({ path: "flesh.emotion_range_min", value: teardown.flesh.emotionRange.min });
  metrics.push({ path: "flesh.emotion_curve_points", value: teardown.flesh.emotionCurve.length });
  metrics.push({ path: "flesh.dialogueRatio", value: teardown.flesh.dialogueRatio });
  metrics.push({ path: "flesh.narrationRatio", value: teardown.flesh.narrationRatio });
  metrics.push({
    path: "flesh.sensory_total",
    value:
      teardown.flesh.sensoryFrequency.visual +
      teardown.flesh.sensoryFrequency.auditory +
      teardown.flesh.sensoryFrequency.tactile +
      teardown.flesh.sensoryFrequency.olfactory +
      teardown.flesh.sensoryFrequency.gustatory,
  });
  metrics.push({
    path: "flesh.characterArc_changePoint",
    value: teardown.flesh.characterArc.changePoint,
  });
  metrics.push({
    path: "flesh.conflictLayers.interpersonal",
    value: teardown.flesh.conflictLayers.interpersonal,
  });
  metrics.push({
    path: "flesh.conflictLayers.internal",
    value: teardown.flesh.conflictLayers.internal,
  });
  metrics.push({
    path: "flesh.conflictLayers.environmental",
    value: teardown.flesh.conflictLayers.environmental,
  });

  // 风格层
  metrics.push({
    path: "style.sentenceStyle.avgLength",
    value: teardown.style.sentenceStyle.avgLength,
  });
  metrics.push({
    path: "style.sentenceStyle.shortSentenceRatio",
    value: teardown.style.sentenceStyle.shortSentenceRatio,
  });
  metrics.push({
    path: "style.sentenceStyle.longSentenceRatio",
    value: teardown.style.sentenceStyle.longSentenceRatio,
  });

  return metrics;
}

/**
 * 聚合单个类型的指标：均值/标准差/分位数
 * 样本数 < 2 时 std 回退为 |mean|*0.2 + 0.01（避免除零与过度敏感）
 */
export interface MetricAggregation {
  mean: number;
  std: number;
  /** 25/50/75 分位 */
  p25: number;
  p50: number;
  p75: number;
  n: number;
}

export function aggregate(values: number[]): MetricAggregation {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, std: 0.01, p25: 0, p50: 0, p75: 0, n: 0 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    n >= 2
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
      : Math.pow(Math.abs(mean) * 0.2 + 0.01, 2);
  const std = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return {
    mean: Number(mean.toFixed(4)),
    std: Number(std.toFixed(4)),
    p25: Number(q(0.25).toFixed(4)),
    p50: Number(q(0.5).toFixed(4)),
    p75: Number(q(0.75).toFixed(4)),
    n,
  };
}

export interface TypeAggregation {
  type: NovelTypeValue;
  sampleSize: number;
  metrics: Record<string, MetricAggregation>;
}

/**
 * 聚合一组 TeardownResult，按类型分组计算各维度统计
 */
export function aggregateByType(
  teardowns: TeardownResult[]
): Record<NovelTypeValue, TypeAggregation> {
  const byType: Record<string, TeardownResult[]> = {};
  for (const t of teardowns) {
    if (!byType[t.type]) byType[t.type] = [];
    byType[t.type].push(t);
  }

  const out = {} as Record<NovelTypeValue, TypeAggregation>;
  const types: NovelTypeValue[] = [
    "plot-driven",
    "emotion-driven",
    "atmosphere-driven",
    "mixed",
  ];
  for (const type of types) {
    const group = byType[type] || [];
    const metricMap: Record<string, number[]> = {};
    for (const t of group) {
      for (const m of extractMetrics(t)) {
        if (!metricMap[m.path]) metricMap[m.path] = [];
        metricMap[m.path].push(m.value);
      }
    }
    const metrics: Record<string, MetricAggregation> = {};
    for (const [path, vals] of Object.entries(metricMap)) {
      metrics[path] = aggregate(vals);
    }
    out[type] = { type, sampleSize: group.length, metrics };
  }
  return out;
}
