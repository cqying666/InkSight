import { z } from "zod";

/**
 * InkSight 拆文分析 — 三层 14 维度 JSON Schema
 *
 * 骨架层（5维）：开头钩子、三幕结构、反转节点、结局类型、事件密度
 * 血肉层（5维）：情绪曲线、对话叙述比、感官描写、人物弧光、冲突层次
 * 风格层（4维）：句式特征、用词偏好、视角分析、叙事时态
 */

/**
 * 比例字段容错：LLM 可能输出 0-1 小数、0-100 百分比、或非数字字符串（如描述性文字）
 * 用 z.any() 接受任意输入，手动 Number() 转换
 * 注意：不能用 z.coerce.number()，因为它在转出 NaN 后会被 Zod number 类型拒绝
 * （报 "Expected number, received nan"），transform 没机会执行
 * NaN（如 "N/A"、null、描述性文字）回退为 0
 */
const ratioField = (description: string) =>
  z
    .any()
    .describe(description)
    .transform((raw) => {
      const v = Number(raw);
      if (Number.isNaN(v)) return 0;
      if (v > 1) return v / 100;
      if (v < 0) return 0;
      return v;
    });

/**
 * 普通数值字段：接受任意输入，NaN 回退为 0
 */
const numField = (description: string) =>
  z
    .any()
    .describe(description)
    .transform((raw) => {
      const v = Number(raw);
      return Number.isNaN(v) ? 0 : v;
    });

/**
 * 容错枚举字段：LLM 可能输出中文、近义词、null 或带多余文字，统一映射到规范值
 * 未命中映射时回退到 fallback（默认 mixed/首个值）
 */
function tolerantEnum<T extends string>(
  values: readonly T[],
  aliases: Record<string, T>,
  description: string,
  fallback?: T
): z.ZodEffects<z.ZodAny, T, unknown> {
  const lowerAliases: Record<string, T> = {};
  for (const [k, v] of Object.entries(aliases)) lowerAliases[k.toLowerCase()] = v;
  const valueSet = new Set(values);
  const fb = fallback ?? values[0];
  return z
    .any()
    .describe(description)
    .transform((raw) => {
      const s = String(raw ?? "").trim().toLowerCase();
      // 1. 直接命中规范值
      if (valueSet.has(s as T)) return s as T;
      // 2. 命中别名映射
      if (lowerAliases[s]) return lowerAliases[s];
      // 3. 子串包含匹配（LLM 可能输出 "情节反转(plot)" 等）
      for (const [alias, canonical] of Object.entries(lowerAliases)) {
        if (s.includes(alias)) return canonical;
      }
      // 4. 规范值作为子串出现
      for (const v of values) {
        if (s.includes(v.toLowerCase())) return v;
      }
      return fb;
    });
}

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
  hookType: tolerantEnum(
    ["suspense", "action", "character", "atmosphere", "dialogue", "mixed"] as const,
    {
      suspense: "suspense",
      悬念: "suspense",
      悬念型: "suspense",
      action: "action",
      动作: "action",
      动作型: "action",
      character: "character",
      人物: "character",
      人物型: "character",
      角色型: "character",
      atmosphere: "atmosphere",
      氛围: "atmosphere",
      氛围型: "atmosphere",
      dialogue: "dialogue",
      对话: "dialogue",
      对话型: "dialogue",
      mixed: "mixed",
      混合: "mixed",
      混合型: "mixed",
    },
    "钩子类型",
    "mixed"
  ),
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
      type: tolerantEnum(
        ["plot", "cognition", "emotion"] as const,
        {
          情节: "plot",
          情节反转: "plot",
          plot: "plot",
          认知: "cognition",
          认知反转: "cognition",
          视角: "cognition",
          cognition: "cognition",
          情感: "emotion",
          情感反转: "emotion",
          情绪: "emotion",
          emotion: "emotion",
        },
        "情节反转/认知反转/情感反转",
        "plot"
      ),
      description: z.string().describe("反转内容描述"),
    })
  ),

  // 4. 结局类型
  endingType: tolerantEnum(
    ["twist", "open", "circular", "tragic", "happy", "ambiguous"] as const,
    {
      twist: "twist",
      反转: "twist",
      反转结局: "twist",
      意外: "twist",
      open: "open",
      开放: "open",
      开放结局: "open",
      circular: "circular",
      环形: "circular",
      循环: "circular",
      tragic: "tragic",
      悲剧: "tragic",
      happy: "happy",
      圆满: "happy",
      喜剧: "happy",
      ambiguous: "ambiguous",
      模糊: "ambiguous",
      开放性: "open",
    },
    "结局类型"
  ),
  endingAnalysis: z.string().describe("结局效果分析"),

  // 5. 事件密度
  eventDensity: numField("每千字事件数"),
  eventDensityEvidence: z.string().describe("事件密度证据"),
});

// ===== 血肉层 =====

export const EmotionCurvePoint = z.object({
  position: ratioField("位置 0-1"),
  emotion: z
    .any()
    .describe("情绪值 -5 到 +5")
    .transform((raw) => {
      const v = Number(raw);
      if (Number.isNaN(v)) return 0;
      return Math.max(-5, Math.min(5, v));
    }),
  label: z.string().describe("情绪标签"),
});

export const FleshLayer = z.object({
  // 6. 情绪曲线
  emotionCurve: z.array(EmotionCurvePoint).min(3).describe("情绪曲线关键点"),
  emotionRange: z.object({
    min: numField("情绪最低值"),
    max: numField("情绪最高值"),
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
    formality: tolerantEnum(
      ["formal", "neutral", "colloquial"] as const,
      {
        formal: "formal",
        正式: "formal",
        书面: "formal",
        neutral: "neutral",
        中性: "neutral",
        平衡: "neutral",
        colloquial: "colloquial",
        口语: "colloquial",
        口语化: "colloquial",
        通俗: "colloquial",
      },
      "正式/中性/口语",
      "neutral"
    ),
    imagery: tolerantEnum(
      ["concrete", "balanced", "abstract"] as const,
      {
        concrete: "concrete",
        具体: "concrete",
        具象: "concrete",
        balanced: "balanced",
        平衡: "balanced",
        均衡: "balanced",
        abstract: "abstract",
        抽象: "abstract",
      },
      "具体/平衡/抽象",
      "balanced"
    ),
    keyword: z.array(z.string()).describe("高频特色用词 Top 5"),
  }),

  // 13. 视角分析
  perspective: tolerantEnum(
    ["first", "second", "third-limited", "third-omniscient", "mixed"] as const,
    {
      first: "first",
      "first-person": "first",
      第一人称: "first",
      "1st": "first",
      second: "second",
      "second-person": "second",
      第二人称: "second",
      "2nd": "second",
      "third-limited": "third-limited",
      "third-limited-person": "third-limited",
      "thirdlimited": "third-limited",
      第三人称有限: "third-limited",
      第三人称限制: "third-limited",
      有限第三人称: "third-limited",
      "third-omniscient": "third-omniscient",
      "third-omniscient-person": "third-omniscient",
      thirdomniscient: "third-omniscient",
      第三人称全知: "third-omniscient",
      全知第三人称: "third-omniscient",
      第三人称: "third-limited",
      third: "third-limited",
      mixed: "mixed",
      混合: "mixed",
      混合视角: "mixed",
    },
    "叙事视角",
    "mixed"
  ),
  perspectiveAnalysis: z.string().describe("视角效果分析"),

  // 14. 叙事时态
  tense: tolerantEnum(
    ["past", "present", "mixed"] as const,
    {
      past: "past",
      过去时: "past",
      过去: "past",
      present: "present",
      现在时: "present",
      现在: "present",
      mixed: "mixed",
      混合: "mixed",
      混合时态: "mixed",
    },
    "叙事时态",
    "mixed"
  ),
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
  type: tolerantEnum(
    ["plot-driven", "emotion-driven", "atmosphere-driven", "mixed"] as const,
    {
      "plot-driven": "plot-driven",
      plotdriven: "plot-driven",
      情节驱动: "plot-driven",
      情节驱动型: "plot-driven",
      "emotion-driven": "emotion-driven",
      emotiondriven: "emotion-driven",
      情感驱动: "emotion-driven",
      情感驱动型: "emotion-driven",
      "atmosphere-driven": "atmosphere-driven",
      atmospheredriven: "atmosphere-driven",
      氛围驱动: "atmosphere-driven",
      氛围驱动型: "atmosphere-driven",
      mixed: "mixed",
      混合: "mixed",
      混合型: "mixed",
    },
    "小说类型",
    "mixed"
  ),
  typeConfidence: z
    .any()
    .describe("类型识别置信度 0-1")
    .transform((raw) => {
      const v = Number(raw);
      if (Number.isNaN(v)) return 0;
      return Math.max(0, Math.min(1, v));
    }),
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
    .transform((arr) => arr.slice(0, 3))
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
