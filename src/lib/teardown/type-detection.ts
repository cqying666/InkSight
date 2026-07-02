import { z } from "zod";
import { NovelType, type NovelTypeValue } from "./schema";
import { callLLMWithSchema } from "../llm/client";
import { TYPE_WEIGHT_TEMPLATES } from "./schema";

/**
 * 类型识别 Prompt
 * 独立一步先识别小说类型，决定后续权重模板
 */

const SYSTEM_PROMPT = `你是一位资深短篇小说编辑。你的任务是快速识别短篇小说的驱动类型。

## 类型定义

1. **plot-driven（情节驱动型）**：以事件推进为主，反转密集，节奏快，读者被"接下来发生什么"驱动
2. **emotion-driven（情感驱动型）**：以人物情感变化为主，内心描写多，读者被"角色感受什么"驱动
3. **atmosphere-driven（氛围驱动型）**：以营造氛围意境为主，感官描写丰富，读者被"沉浸感"驱动
4. **mixed（混合型）**：多种驱动均衡，无法明确判断主导类型，或特征不明确

## 输出格式

只输出一个合法 JSON 对象，不要包含 markdown 代码块、不要任何额外文字：

{
  "type": "plot-driven",
  "confidence": 0.85,
  "reasoning": "判断理由（一句话）"
}

type 字段必须是以下四个值之一：plot-driven、emotion-driven、atmosphere-driven、mixed
confidence 字段必须是 0 到 1 之间的数字。

## 注意

- 置信度低于 0.7 时请输出 "mixed"
- 短篇小说通常类型特征鲜明，但有些作品确实均衡`;

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
  const maxChars = 8_000;
  const text = novelText.slice(0, maxChars);

  const { data } = await callLLMWithSchema({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `请识别以下小说的驱动类型，输出合法 JSON。\n\n${text}`,
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
