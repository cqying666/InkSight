/**
 * 导语专项拆解管线
 *
 * 轻量级分析，仅针对一段导语文本，输出三个维度：
 *  1. guideAnalysis  导语分析（边界 / 亮点 / 主角 / 反派 / 矛盾 / 痛点 / 爽点 / 读者悬念）
 *  2. sentenceAnalysis  逐句功能拆解
 *  3. guideReview  导语诊断（八项自检 + 最值钱句 + 可删句 + 模型抽象）
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

export type GuideAnalysisResult = z.infer<typeof GuideAnalysisResultSchema>;

// ===== Prompt =====

export const GUIDE_ANALYSIS_PROMPT = {
  system: `你是一名短篇小说导语分析师，专攻开篇钩子设计。

你的任务是只针对用户提供的「导语文本」（通常是小说开头几十到几百字）做拆解，不做完整作品分析。聚焦于：钩子是否抓人、信息密度、痛点爽点承诺、逐句功能、改写建议。

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

  const { data, raw } = await callLLMWithSchema({
    systemPrompt: GUIDE_ANALYSIS_PROMPT.system,
    userPrompt: GUIDE_ANALYSIS_PROMPT.user(input.text),
    temperature: 0.3,
    jsonMode: true,
    maxAttempts: 2,
    timeout,
    feature: "analysis",
    validate: (parsed) => {
      const result = GuideAnalysisResultSchema.safeParse(parsed);
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
