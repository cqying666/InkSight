/**
 * 导语专项拆解管线
 *
 * 轻量级分析，仅针对一段导语文本。基础模式输出三个维度：
 *  1. guideAnalysis  导语分析（边界 / 亮点 / 主角 / 反派 / 矛盾 / 痛点 / 爽点 / 读者悬念）
 *  2. sentenceAnalysis  逐句功能拆解
 *  3. guideReview  导语诊断（八项自检 + 最值钱句 + 可删句 + 模型抽象）
 * 二创模式额外输出 coreElements 与 derivativeDirections。
 *
 * 与完整拆文 pipeline 的差异：
 *  - 字数下限 30（导语通常 100-300 字）
 *  - 不跑人设分析，不做六核心要素精拆
 *  - 单次 LLM 调用，耗时短、消耗少
 */

import { z } from "zod";
import { callLLMWithSchema } from "../llm/client";

// ===== 输入 Schema =====

export const GuideAnalysisInputSchema = z.object({
  text: z
    .string()
    .min(30, "导语文本过短，至少 30 字")
    .max(2_000, "导语上限 2000 字"),
  fileName: z.string().optional(),
  mode: z.enum(["analysis", "analysis_with_directions"]).default("analysis"),
});

export type GuideAnalysisInput = z.infer<typeof GuideAnalysisInputSchema>;

// ===== 输出 Schema =====

const str = z.string();
const strArr = z.array(z.string());
const bool = z.boolean();

export const GuideAnalysisResultSchema = z.object({
  guideAnalysis: z.object({
    exists: bool,
    boundaryJudgment: str,
    highlights: strArr,
    protagonistIdentity: str,
    antagonist: str,
    firstConflict: str,
    painPoint: str,
    satisfactionPoint: str,
    readerCuriosity: str,
    isCatchy: bool,
  }),
  sentenceAnalysis: z.array(
    z.object({
      sentence: str,
      function: str,
    })
  ),
  guideReview: z.object({
    firstSentenceCatchy: bool,
    quickProtagonist: bool,
    quickRelations: bool,
    quickConflict: bool,
    strongContrast: bool,
    clearPainPoint: bool,
    promisesSatisfaction: bool,
    holdsQuestion: bool,
    mostValuableSentence: str,
    deletableSentence: str,
    guideModel: str,
  }),
});

export const GuideAnalysisWithDirectionsResultSchema =
  GuideAnalysisResultSchema.extend({
    coreElements: z.object({
      hookMechanism: str,
      protagonistSetup: str,
      conflictEngine: str,
      painPromise: str,
      satisfactionPromise: str,
      informationGap: str,
      emotionalContrast: str,
      sentenceStructure: z.array(str).min(2).max(8),
    }),
    derivativeDirections: z
      .array(
        z.object({
          title: str,
          newCorePremise: str,
          transferableMechanism: str,
          replaceableElements: z.array(str).min(2).max(6),
          openingBlueprint: str,
          differentiation: str,
          risk: str,
        })
      )
      .min(3)
      .max(5),
    recommendedDirection: str,
    recommendationReason: str,
  });

export type GuideAnalysisBaseResult = z.infer<
  typeof GuideAnalysisResultSchema
>;
export type GuideAnalysisWithDirectionsResult = z.infer<
  typeof GuideAnalysisWithDirectionsResultSchema
>;
export type GuideAnalysisResult =
  | GuideAnalysisBaseResult
  | GuideAnalysisWithDirectionsResult;

// ===== Prompt =====

export const GUIDE_ANALYSIS_PROMPT = {
  system: `你是一名短篇小说导语分析师，专攻开篇钩子设计。

你的任务是只针对用户提供的「导语文本」（通常是小说开头几十到几百字）做拆解，不做完整作品分析。聚焦于：钩子是否抓人、信息密度、痛点爽点承诺、逐句功能、可删改点与模型抽象。

原则：
1. 不要假设这是一篇完整作品，只分析已给文本。
2. 信息不足处标注「待补」，不要凭空补全。
3. 逐句分析必须引用原句。
4. 所有结论指向「这段导语能不能让读者继续往下看」。

直接输出以 { 开头的 JSON，不要包含 markdown 代码块或任何额外文字。结构如下：

{
  "guideAnalysis": {
    "exists": true,
    "boundaryJudgment": "判定这是否为完整导语、边界如何",
    "highlights": ["亮点1", "亮点2"],
    "protagonistIdentity": "主角身份或处境",
    "antagonist": "反派或冲突方（没有则填'无'）",
    "firstConflict": "第一矛盾冲突",
    "painPoint": "导语承诺的痛点",
    "satisfactionPoint": "导语承诺的爽点",
    "readerCuriosity": "读者看完最想知道什么",
    "isCatchy": true
  },
  "sentenceAnalysis": [
    { "sentence": "逐句引用原句", "function": "这句话在行文中的功能分析" }
  ],
  "guideReview": {
    "firstSentenceCatchy": true,
    "quickProtagonist": true,
    "quickRelations": true,
    "quickConflict": true,
    "strongContrast": true,
    "clearPainPoint": true,
    "promisesSatisfaction": true,
    "holdsQuestion": true,
    "mostValuableSentence": "导语哪一句最值钱",
    "deletableSentence": "导语哪一句可以删或改（没有则填'无'）",
    "guideModel": "导语模型一句话抽象"
  }
}`,
  user: (text: string) => `请拆解以下导语：

${text}`,
};

export const GUIDE_ANALYSIS_DIRECTIONS_EXTENSION = `

本次用户还明确要求「根据导语核心元素给出二创方向」。除上述字段外，必须在同一个 JSON 顶层追加以下字段：

{
  "coreElements": {
    "hookMechanism": "钩子真正生效的结构机制，不复述专属情节",
    "protagonistSetup": "可迁移的主角处境与身份反差",
    "conflictEngine": "推动读者继续看的矛盾发动机",
    "painPromise": "导语承诺继续加深的痛点机制",
    "satisfactionPromise": "后续可能兑现的爽点机制",
    "informationGap": "角色与读者之间的信息差",
    "emotionalContrast": "导语使用的情绪反差",
    "sentenceStructure": ["第1步的句子功能", "第2步的句子功能", "第3步的句子功能"]
  },
  "derivativeDirections": [
    {
      "title": "方向名称",
      "newCorePremise": "替换人物、关系、场景后的新核心梗",
      "transferableMechanism": "从原导语迁移的结构机制",
      "replaceableElements": ["被替换的原元素→新元素", "另一项替换"],
      "openingBlueprint": "只描述新导语的起手顺序和钩子落点，不直接代写完整导语",
      "differentiation": "与原导语在人物、关系、场景和冲突上的实质差异",
      "risk": "容易照搬或失效的风险与避雷"
    }
  ],
  "recommendedDirection": "最值得优先尝试的方向名称",
  "recommendationReason": "推荐理由"
}

二创规则：
1. derivativeDirections 必须给出 3—5 条，并在题材、人物关系或冲突发动机上形成实质差异。
2. 只迁移钩子、信息差、痛爽承诺和句序等机制，不沿用原文专属姓名、精确数字、关系组合或可识别表达。
3. openingBlueprint 只给结构蓝图，不替用户直接写完整成品导语。
4. 每个方向都要说明替换了什么、为何仍能成立、怎样避免像换皮。
5. recommendedDirection 必须能与某一 direction.title 对应。`;

// ===== 管线函数 =====

/**
 * 执行导语专项拆解
 *
 * @param input 导语文本
 * @param options.timeout 超时毫秒，默认 120s
 */
export async function runGuideAnalysisPipeline(
  input: GuideAnalysisInput,
  options: { timeout?: number } = {}
): Promise<{
  data: GuideAnalysisResult;
  durationMs: number;
  tokens: number;
}> {
  const { timeout = 120_000 } = options;
  const startTime = Date.now();
  const withDirections = input.mode === "analysis_with_directions";
  const resultSchema = withDirections
    ? GuideAnalysisWithDirectionsResultSchema
    : GuideAnalysisResultSchema;

  const { data, raw } = await callLLMWithSchema<GuideAnalysisResult>({
    systemPrompt: withDirections
      ? `${GUIDE_ANALYSIS_PROMPT.system}${GUIDE_ANALYSIS_DIRECTIONS_EXTENSION}`
      : GUIDE_ANALYSIS_PROMPT.system,
    userPrompt: GUIDE_ANALYSIS_PROMPT.user(input.text),
    temperature: 0.3,
    jsonMode: true,
    maxTokens: withDirections ? 6_144 : 4_096,
    maxAttempts: 2,
    timeout,
    feature: "analysis",
    validate: (parsed) => {
      const result = resultSchema.safeParse(parsed);
      if (result.success) {
        return { success: true, data: result.data };
      }
      return {
        success: false,
        error: result.error,
      };
    },
  });

  return {
    data,
    durationMs: Date.now() - startTime,
    tokens: raw.usage.totalTokens,
  };
}
