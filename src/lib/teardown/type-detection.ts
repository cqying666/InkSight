import { z } from "zod";
import { NovelType, type NovelTypeValue, TYPE_WEIGHT_TEMPLATES } from "./schema";
import { callLLMWithSchema } from "../llm/client";
import { TYPE_DETECTION_PROMPT } from "./prompts";

const TypeResultSchema = z.object({
  type: NovelType,
  confidence: z.coerce.number().min(0).max(1),
  reasoning: z.string(),
});

/**
 * 类型识别（独立步骤）
 * 用于在拆解前先判断类型，加载对应权重模板
 */
export async function detectNovelType(novelText: string): Promise<{
  type: NovelTypeValue;
  confidence: number;
  reasoning: string;
}> {
  const { data } = await callLLMWithSchema({
    systemPrompt: TYPE_DETECTION_PROMPT.system,
    userPrompt: TYPE_DETECTION_PROMPT.user(novelText),
    temperature: 0.2,
    jsonMode: true,
    maxAttempts: 2,
    validate: (parsed) => TypeResultSchema.safeParse(parsed),
  });

  // 置信度低于 0.7 降级为 mixed
  const finalType: NovelTypeValue =
    data.confidence < 0.7 ? "mixed" : data.type;

  return {
    type: finalType,
    confidence: data.confidence,
    reasoning: data.reasoning,
  };
}

/**
 * 获取类型对应的权重模板
 */
export function getWeightTemplate(type: NovelTypeValue) {
  return TYPE_WEIGHT_TEMPLATES[type];
}
