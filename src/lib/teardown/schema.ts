import { z } from "zod";

/**
 * InkSight 拆文分析 — 三层 14 维度 JSON Schema
 *
 * 骨架层（5维）：开头钩子、三幕结构、反转节点、结局类型、事件密度
 * 血肉层（5维）：情绪曲线、对话叙述比、感官描写、人物弧光、冲突层次
 * 风格层（4维）：句式特征、用词偏好、视角分析、叙事时态
 */

/**
 * 比例字段容错：LLM 可能输出 0-1 小数或 0-100 百分比，统一归一化为 0-1
 * 用 coerce 接受字符串形式的数字（如 "0.6"）
 */
const ratioField = (description: string) =>
  z.coerce
    .number()
    .describe(description)
    .transform((v) => {
      if (v > 1) return v / 100;
      if (v < 0) return 0;
      return v;
    });

/**
 * 普通数值字段：用 coerce 接受字符串形式
 */
const numField = (description: string) => z.coerce.number().describe(description);

// ===== 骨架层 =====

export const HookType = z.enum([
  "suspense", // 悬念型
  "action", // 动作型
  "character", // 人物型
  "atmosphere", // 氛围型
  "dialogue", // 对话型
  "mixed", // 混合型
]);

export const SkeletonLayer = z.object({
  // 1. 开头钩子
  hookType: HookType,
  hookStrength: numField("钩子强度 0-5"),
  hookEvidence: z.string().describe("原文开头 200 字内证据引用"),
  hookAnalysis: z.string().describe("钩子效果分析"),

  // 2. 三幕结构占比
  threeActRatio: z.object({
    setup: ratioField("建置段占比 0-1"),
    confrontation: ratioField("对抗段占比 0-1"),
    resolution: ratioField("解决段占比 0-1"),
  }),

  // 3. 反转节点
  reversals: z.array(
    z.object({
      position: ratioField("反转位置 0-1（全文占比）"),
      type: z.enum(["plot", "cognition", "emotion"]).describe("情节反转/认知反转/情感反转"),
      description: z.string().describe("反转内容描述"),
    })
  ),

  // 4. 结局类型
  endingType: z.enum([
    "twist", // 反转结局
    "open", // 开放结局
    "circular", // 环形结局
    "tragic", // 悲剧结局
    "happy", // 圆满结局
    "ambiguous", // 模糊结局
  ]),
  endingAnalysis: z.string().describe("结局效果分析"),

  // 5. 事件密度
  eventDensity: numField("每千字事件数"),
  eventDensityEvidence: z.string().describe("事件密度证据"),
});

// ===== 血肉层 =====

export const EmotionCurvePoint = z.object({
  position: ratioField("位置 0-1"),
  emotion: z.coerce.number().min(-5).max(5).describe("情绪值 -5 到 +5"),
  label: z.string().describe("情绪标签"),
});

export const FleshLayer = z.object({
  // 6. 情绪曲线
  emotionCurve: z.array(EmotionCurvePoint).min(5).describe("情绪曲线关键点，至少 5 个"),
  emotionRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  emotionTrend: z.string().describe("情绪走势描述"),

  // 7. 对话与叙述比例
  dialogueRatio: ratioField("对话占比 0-1"),
  narrationRatio: ratioField("叙述占比 0-1"),
  dialogueAnalysis: z.string().describe("对话效果分析"),

  // 8. 感官描写频率
  sensoryFrequency: z.object({
    visual: numField("视觉描写频率（每千字）"),
    auditory: numField("听觉"),
    tactile: numField("触觉"),
    olfactory: numField("嗅觉"),
    gustatory: numField("味觉"),
  }),
  sensoryAnalysis: z.string().describe("感官描写效果分析"),

  // 9. 人物弧光
  characterArc: z.object({
    desire: z.string().describe("主角欲望"),
    obstacle: z.string().describe("主要障碍"),
    change: z.string().describe("变化路径"),
    changePoint: ratioField("变化节点位置 0-1"),
  }),

  // 10. 冲突层次
  conflictLayers: z.object({
    interpersonal: ratioField("人际冲突占比"),
    internal: ratioField("内心冲突占比"),
    environmental: ratioField("环境冲突占比"),
    dominantConflict: z.string().describe("主导冲突描述"),
  }),
});

// ===== 风格层 =====

export const StyleLayer = z.object({
  // 11. 句式特征
  sentenceStyle: z.object({
    avgLength: numField("平均句长（字）"),
    shortSentenceRatio: ratioField("短句占比"),
    longSentenceRatio: ratioField("长句占比"),
    rhythm: z.string().describe("句式节奏描述"),
  }),

  // 12. 用词偏好
  wordPreference: z.object({
    formality: z.enum(["formal", "neutral", "colloquial"]),
    imagery: z.enum(["concrete", "balanced", "abstract"]),
    keyword: z.array(z.string()).describe("高频特色用词 Top 5"),
  }),

  // 13. 视角分析
  perspective: z.enum([
    "first", // 第一人称
    "second", // 第二人称
    "third-limited", // 第三人称有限
    "third-omniscient", // 第三人称全知
    "mixed", // 混合视角
  ]),
  perspectiveAnalysis: z.string().describe("视角效果分析"),

  // 14. 叙事时态
  tense: z.enum(["past", "present", "mixed"]),
  tenseAnalysis: z.string().describe("时态效果分析"),
});

// ===== 完整拆解结果 =====

export const NovelType = z.enum([
  "plot-driven", // 情节驱动型
  "emotion-driven", // 情感驱动型
  "atmosphere-driven", // 氛围驱动型
  "mixed", // 混合型
]);

export const TeardownSchema = z.object({
  // 元信息
  type: NovelType,
  typeConfidence: z.coerce.number().min(0).max(1).describe("类型识别置信度 0-1"),
  wordCount: numField("总字数"),
  paragraphCount: numField("总段落数"),

  // 三层结构
  skeleton: SkeletonLayer,
  flesh: FleshLayer,
  style: StyleLayer,

  // 总评
  summary: z.string().describe("一句话总评"),
  keyFindings: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("1-3 个核心发现"),
});

// ===== 类型导出 =====

export type TeardownResult = z.infer<typeof TeardownSchema>;
export type NovelTypeValue = z.infer<typeof NovelType>;
export type HookTypeValue = z.infer<typeof HookType>;

// ===== 类型权重模板 =====

export const TYPE_WEIGHT_TEMPLATES: Record<
  NovelTypeValue,
  { highlight: string[]; fold: string[] }
> = {
  "plot-driven": {
    highlight: ["hookType", "reversals", "eventDensity", "threeActRatio", "conflictLayers"],
    fold: ["sensoryFrequency", "wordPreference", "tense"],
  },
  "emotion-driven": {
    highlight: ["emotionCurve", "characterArc", "conflictLayers", "dialogueRatio", "hookType"],
    fold: ["sentenceStyle", "threeActRatio"],
  },
  "atmosphere-driven": {
    highlight: ["sensoryFrequency", "emotionCurve", "sentenceStyle", "wordPreference", "perspective"],
    fold: ["reversals", "eventDensity"],
  },
  mixed: {
    highlight: ["hookType", "emotionCurve", "reversals", "characterArc"],
    fold: [],
  },
};

// ===== 校验器 =====

export function validateTeardown(data: unknown): {
  success: boolean;
  data?: TeardownResult;
  errors?: string[];
} {
  const result = TeardownSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    ),
  };
}
