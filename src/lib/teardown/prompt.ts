import { TeardownSchema, type TeardownResult } from "./schema";
import { callLLMWithSchema } from "../llm/client";

/**
 * 拆解 Prompt 设计 v1
 * 三层 14 维度结构化拆解
 */

const SYSTEM_PROMPT = `你是一位资深短篇小说编辑和结构分析专家。你的任务是对短篇小说进行三层 14 维度的结构化拆解。

## 拆解原则

1. **每个维度必须附带原文证据引用**（evidence 字段），引用原文具体段落
2. **数值要精确**：位置用 0-1 的比例值，情绪用 -5 到 +5 的整数值
3. **分析要具体**：不要空泛描述，要指向具体段落和用词
4. **类型识别**：根据作品整体特征判断类型
   - plot-driven（情节驱动型）：以事件推进为主，反转密集
   - emotion-driven（情感驱动型）：以人物情感变化为主
   - atmosphere-driven（氛围驱动型）：以营造氛围意境为主
   - mixed（混合型）：多种驱动均衡，或置信度 <0.7
5. **情绪曲线**：选取至少 5 个关键转折点，标注位置和情绪值

## 输出格式

必须输出合法 JSON，结构与以下 schema 一致：

- type: 小说类型
- typeConfidence: 类型置信度 0-1
- wordCount: 总字数
- paragraphCount: 总段落数
- skeleton: 骨架层（5维）
  - hookType: 钩子类型 (suspense/action/character/atmosphere/dialogue/mixed)
  - hookStrength: 钩子强度 0-5
  - hookEvidence: 原文证据
  - hookAnalysis: 效果分析
  - threeActRatio: {setup, confrontation, resolution} 各占 0-1
  - reversals: [{position, type, description}] 反转节点数组
  - endingType: 结局类型 (twist/open/circular/tragic/happy/ambiguous)
  - endingAnalysis: 结局分析
  - eventDensity: 每千字事件数
  - eventDensityEvidence: 证据
- flesh: 血肉层（5维）
  - emotionCurve: [{position, emotion, label}] 至少5个点
  - emotionRange: {min, max}
  - emotionTrend: 走势描述
  - dialogueRatio: 对话占比 0-1
  - narrationRatio: 叙述占比 0-1
  - dialogueAnalysis: 对话效果
  - sensoryFrequency: {visual, auditory, tactile, olfactory, gustatory} 各类每千字频率
  - sensoryAnalysis: 感官描写效果
  - characterArc: {desire, obstacle, change, changePoint}
  - conflictLayers: {interpersonal, internal, environmental 各占 0-1 的小数如 0.6, dominantConflict 文字描述}
- style: 风格层（4维）
  - sentenceStyle: {avgLength, shortSentenceRatio, longSentenceRatio, rhythm}
  - wordPreference: {formality, imagery, keyword[]}
  - perspective: 视角 (first/second/third-limited/third-omniscient/mixed)
  - perspectiveAnalysis: 视角效果
  - tense: 时态 (past/present/mixed)
  - tenseAnalysis: 时态效果
- summary: 一句话总评
- keyFindings: 1-3 个核心发现`;

/**
 * 构建拆解用户 prompt
 */
function buildUserPrompt(novelText: string): string {
  // 截断过长文本（LLM 上下文限制）
  const maxChars = 20_000;
  const text =
    novelText.length > maxChars
      ? novelText.slice(0, maxChars) + "\n\n[文本过长，已截断]"
      : novelText;

  return `请对以下短篇小说进行三层 14 维度结构化拆解，输出合法 JSON。

## 小说全文

${text}

## 要求

1. 仔细阅读全文，逐段分析
2. 每个维度的 evidence 字段必须引用原文具体文字
3. 数值要精确，不要随意取整
4. 输出必须是合法 JSON，不要包含任何注释或额外文字`;
}

/**
 * 执行拆解分析
 * @param novelText 小说全文
 * @returns 拆解结果（已通过 schema 校验）
 */
export async function teardownNovel(novelText: string): Promise<{
  data: TeardownResult;
  durationMs: number;
  tokens: number;
}> {
  const { data, raw } = await callLLMWithSchema({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(novelText),
    temperature: 0.3, // 拆解需稳定
    jsonMode: true,
    maxAttempts: 2,
    validate: (parsed) => TeardownSchema.safeParse(parsed),
  });

  return {
    data,
    durationMs: raw.durationMs,
    tokens: raw.usage.totalTokens,
  };
}
