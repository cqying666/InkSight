import { TeardownSchema, type TeardownResult, type NovelTypeValue, TYPE_WEIGHT_TEMPLATES } from "./schema";
import { callLLMWithSchema } from "../llm/client";
import { TEARDOWN_PROMPT } from "./prompts";

/**
 * 拆解分析主入口
 *
 * prompt 定义已抽到 prompts.ts，与 tests/consistency-monitor.ts 共用
 */

/**
 * 执行拆解分析
 * @param novelText 小说全文
 * @param novelType 已识别的类型（可选，默认自动识别）
 * @returns 拆解结果（已通过 schema 校验）
 */
export async function teardownNovel(
  novelText: string,
  novelType?: NovelTypeValue
): Promise<{
  data: TeardownResult;
  durationMs: number;
  tokens: number;
}> {
  const finalType: NovelTypeValue = novelType || "mixed";
  const weights = TYPE_WEIGHT_TEMPLATES[finalType];

  const { data, raw } = await callLLMWithSchema({
    systemPrompt: TEARDOWN_PROMPT.system(finalType, weights),
    userPrompt: TEARDOWN_PROMPT.user(novelText),
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
