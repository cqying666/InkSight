import type { TeardownResult } from "../teardown/schema";
import type { NovelTypeValue } from "../teardown/schema";
import type { DiagnosisResult, DiagnosisFinding } from "../diagnosis/engine";
import { TYPE_WEIGHT_TEMPLATES } from "../teardown/schema";

/**
 * 维度元数据 (P2-T7)
 *
 * 把 14 维度拆解结果展开为可渲染的卡片列表，按骨架/血肉/风格三层分组。
 * 用 TYPE_WEIGHT_TEMPLATES 决定哪些维度高亮、哪些折叠。
 * 关联 DiagnosisFinding 标注薄弱点/提升机会。
 */

export type DimensionLayer = "skeleton" | "flesh" | "style";

export interface DimensionCard {
  /** 维度 key（与 TYPE_WEIGHT_TEMPLATES 的 highlight/fold 项对齐） */
  key: string;
  /** 中文名 */
  label: string;
  /** 所属层 */
  layer: DimensionLayer;
  /** 层中文名 */
  layerLabel: string;
  /** 主值（已格式化） */
  displayValue: string;
  /** 补充信息（证据/分析摘要） */
  detail?: string;
  /** 关联的诊断 finding（如有） */
  finding?: DiagnosisFinding;
  /** 该维度在当前类型权重下是否高亮 */
  highlight: boolean;
  /** 该维度在当前类型权重下是否默认折叠 */
  fold: boolean;
}

const LAYER_LABEL: Record<DimensionLayer, string> = {
  skeleton: "骨架层",
  flesh: "血肉层",
  style: "风格层",
};

// ===== 格式化辅助 =====

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtNum = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(1);

const HOOK_TYPE_LABEL: Record<string, string> = {
  suspense: "悬念型",
  action: "动作型",
  character: "人物型",
  atmosphere: "氛围型",
  dialogue: "对话型",
  mixed: "混合型",
};

const ENDING_TYPE_LABEL: Record<string, string> = {
  twist: "反转结局",
  open: "开放结局",
  circular: "环形结局",
  tragic: "悲剧结局",
  happy: "圆满结局",
  ambiguous: "模糊结局",
};

const PERSPECTIVE_LABEL: Record<string, string> = {
  first: "第一人称",
  second: "第二人称",
  "third-limited": "第三人称有限",
  "third-omniscient": "第三人称全知",
  mixed: "混合视角",
};

const TENSE_LABEL: Record<string, string> = {
  past: "过去时",
  present: "现在时",
  mixed: "混合时态",
};

// ===== 维度提取 =====

interface ExtractContext {
  teardown: TeardownResult;
  findingByMetric: Record<string, DiagnosisFinding>;
  highlight: Set<string>;
  fold: Set<string>;
}

function buildSkeletonCards(ctx: ExtractContext): DimensionCard[] {
  const { teardown: t, findingByMetric, highlight, fold } = ctx;
  const s = t.skeleton;
  const cards: DimensionCard[] = [];

  // 1. 开头钩子
  cards.push({
    key: "hookType",
    label: "开头钩子",
    layer: "skeleton",
    layerLabel: LAYER_LABEL.skeleton,
    displayValue: `${HOOK_TYPE_LABEL[s.hookType] || s.hookType} · 强度 ${s.hookStrength}/5`,
    detail: s.hookAnalysis,
    finding: findingByMetric["skeleton.hookStrength"],
    highlight: highlight.has("hookType"),
    fold: fold.has("hookType"),
  });

  // 2. 三幕结构
  cards.push({
    key: "threeActRatio",
    label: "三幕结构占比",
    layer: "skeleton",
    layerLabel: LAYER_LABEL.skeleton,
    displayValue: `建置 ${pct(s.threeActRatio.setup)} / 对抗 ${pct(
      s.threeActRatio.confrontation
    )} / 解决 ${pct(s.threeActRatio.resolution)}`,
    finding: findingByMetric["skeleton.threeActRatio.confrontation"],
    highlight: highlight.has("threeActRatio"),
    fold: fold.has("threeActRatio"),
  });

  // 3. 反转节点
  cards.push({
    key: "reversals",
    label: "反转节点",
    layer: "skeleton",
    layerLabel: LAYER_LABEL.skeleton,
    displayValue: `${s.reversals.length} 个（位置 ${s.reversals
      .map((r) => pct(r.position))
      .join("、")})`,
    detail: s.reversals
      .map((r, i) => `${i + 1}. ${pct(r.position)} · ${r.description}`)
      .join("\n"),
    finding: findingByMetric["skeleton.reversals_count"],
    highlight: highlight.has("reversals"),
    fold: fold.has("reversals"),
  });

  // 4. 结局类型
  cards.push({
    key: "endingType",
    label: "结局类型",
    layer: "skeleton",
    layerLabel: LAYER_LABEL.skeleton,
    displayValue: ENDING_TYPE_LABEL[s.endingType] || s.endingType,
    detail: s.endingAnalysis,
    highlight: highlight.has("endingType"),
    fold: fold.has("endingType"),
  });

  // 5. 事件密度
  cards.push({
    key: "eventDensity",
    label: "事件密度",
    layer: "skeleton",
    layerLabel: LAYER_LABEL.skeleton,
    displayValue: `${fmtNum(s.eventDensity)} /千字`,
    detail: s.eventDensityEvidence,
    finding: findingByMetric["skeleton.eventDensity"],
    highlight: highlight.has("eventDensity"),
    fold: fold.has("eventDensity"),
  });

  return cards;
}

function buildFleshCards(ctx: ExtractContext): DimensionCard[] {
  const { teardown: t, findingByMetric, highlight, fold } = ctx;
  const f = t.flesh;
  const cards: DimensionCard[] = [];

  // 6. 情绪曲线
  cards.push({
    key: "emotionCurve",
    label: "情绪曲线",
    layer: "flesh",
    layerLabel: LAYER_LABEL.flesh,
    displayValue: `幅度 ${fmtNum(f.emotionRange.min)} 到 ${fmtNum(
      f.emotionRange.max
    )} · ${f.emotionCurve.length} 个关键点`,
    detail: f.emotionTrend,
    finding:
      findingByMetric["flesh.emotion_range_max"] ||
      findingByMetric["flesh.emotion_range_min"],
    highlight: highlight.has("emotionCurve"),
    fold: fold.has("emotionCurve"),
  });

  // 7. 对话与叙述比例
  cards.push({
    key: "dialogueRatio",
    label: "对话与叙述比例",
    layer: "flesh",
    layerLabel: LAYER_LABEL.flesh,
    displayValue: `对话 ${pct(f.dialogueRatio)} / 叙述 ${pct(f.narrationRatio)}`,
    detail: f.dialogueAnalysis,
    finding: findingByMetric["flesh.dialogueRatio"],
    highlight: highlight.has("dialogueRatio"),
    fold: fold.has("dialogueRatio"),
  });

  // 8. 感官描写
  const sensory = f.sensoryFrequency;
  const total =
    sensory.visual +
    sensory.auditory +
    sensory.tactile +
    sensory.olfactory +
    sensory.gustatory;
  cards.push({
    key: "sensoryFrequency",
    label: "感官描写",
    layer: "flesh",
    layerLabel: LAYER_LABEL.flesh,
    displayValue: `总频 ${fmtNum(total)}/千字（视 ${fmtNum(
      sensory.visual
    )} · 听 ${fmtNum(sensory.auditory)} · 触 ${fmtNum(
      sensory.tactile
    )} · 嗅 ${fmtNum(sensory.olfactory)} · 味 ${fmtNum(sensory.gustatory)}）`,
    detail: f.sensoryAnalysis,
    finding: findingByMetric["flesh.sensory_total"],
    highlight: highlight.has("sensoryFrequency"),
    fold: fold.has("sensoryFrequency"),
  });

  // 9. 人物弧光
  cards.push({
    key: "characterArc",
    label: "人物弧光",
    layer: "flesh",
    layerLabel: LAYER_LABEL.flesh,
    displayValue: `欲望：${f.characterArc.desire} · 变化点 ${pct(
      f.characterArc.changePoint
    )}`,
    detail: `障碍：${f.characterArc.obstacle}\n变化：${f.characterArc.change}`,
    finding: findingByMetric["flesh.characterArc_changePoint"],
    highlight: highlight.has("characterArc"),
    fold: fold.has("characterArc"),
  });

  // 10. 冲突层次
  cards.push({
    key: "conflictLayers",
    label: "冲突层次",
    layer: "flesh",
    layerLabel: LAYER_LABEL.flesh,
    displayValue: `人际 ${pct(f.conflictLayers.interpersonal)} / 内心 ${pct(
      f.conflictLayers.internal
    )} / 环境 ${pct(f.conflictLayers.environmental)}`,
    detail: f.conflictLayers.dominantConflict,
    finding:
      findingByMetric["flesh.conflictLayers.interpersonal"] ||
      findingByMetric["flesh.conflictLayers.internal"] ||
      findingByMetric["flesh.conflictLayers.environmental"],
    highlight: highlight.has("conflictLayers"),
    fold: fold.has("conflictLayers"),
  });

  return cards;
}

function buildStyleCards(ctx: ExtractContext): DimensionCard[] {
  const { teardown: t, highlight, fold } = ctx;
  const st = t.style;
  const cards: DimensionCard[] = [];

  // 11. 句式特征
  cards.push({
    key: "sentenceStyle",
    label: "句式特征",
    layer: "style",
    layerLabel: LAYER_LABEL.style,
    displayValue: `均长 ${fmtNum(st.sentenceStyle.avgLength)} 字 · 短句 ${pct(
      st.sentenceStyle.shortSentenceRatio
    )} · 长句 ${pct(st.sentenceStyle.longSentenceRatio)}`,
    detail: st.sentenceStyle.rhythm,
    highlight: highlight.has("sentenceStyle"),
    fold: fold.has("sentenceStyle"),
  });

  // 12. 用词偏好
  cards.push({
    key: "wordPreference",
    label: "用词偏好",
    layer: "style",
    layerLabel: LAYER_LABEL.style,
    displayValue: `高频词：${st.wordPreference.keyword.join("、")}`,
    detail: `正式度 ${st.wordPreference.formality} · 意象 ${st.wordPreference.imagery}`,
    highlight: highlight.has("wordPreference"),
    fold: fold.has("wordPreference"),
  });

  // 13. 视角分析
  cards.push({
    key: "perspective",
    label: "视角分析",
    layer: "style",
    layerLabel: LAYER_LABEL.style,
    displayValue: PERSPECTIVE_LABEL[st.perspective] || st.perspective,
    detail: st.perspectiveAnalysis,
    highlight: highlight.has("perspective"),
    fold: fold.has("perspective"),
  });

  // 14. 叙事时态
  cards.push({
    key: "tense",
    label: "叙事时态",
    layer: "style",
    layerLabel: LAYER_LABEL.style,
    displayValue: TENSE_LABEL[st.tense] || st.tense,
    detail: st.tenseAnalysis,
    highlight: highlight.has("tense"),
    fold: fold.has("tense"),
  });

  return cards;
}

// ===== 主导出 =====

export function buildDimensionCards(
  teardown: TeardownResult,
  diagnosis: DiagnosisResult
): DimensionCard[] {
  const weights =
    TYPE_WEIGHT_TEMPLATES[teardown.type as NovelTypeValue] || {
      highlight: [],
      fold: [],
    };
  const highlight = new Set(weights.highlight);
  const fold = new Set(weights.fold);

  // 诊断 finding 按 metricPath 索引
  const findingByMetric: Record<string, DiagnosisFinding> = {};
  for (const w of diagnosis.weaknesses) {
    findingByMetric[w.metricPath] = w;
  }
  for (const o of diagnosis.opportunities) {
    findingByMetric[o.metricPath] = o;
  }

  const ctx: ExtractContext = {
    teardown,
    findingByMetric,
    highlight,
    fold,
  };

  return [
    ...buildSkeletonCards(ctx),
    ...buildFleshCards(ctx),
    ...buildStyleCards(ctx),
  ];
}

export const LAYER_ORDER: DimensionLayer[] = ["skeleton", "flesh", "style"];
