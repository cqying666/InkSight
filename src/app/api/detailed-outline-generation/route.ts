import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLMWithSchema } from "@/lib/llm/client";
import {
  DETAILED_OUTLINE_GENERATION_SYSTEM_PROMPT,
  buildDetailedOutlineGenerationUserPrompt,
} from "@/lib/write/detailed-outline-prompt";
import type { DetailedOutlineResult } from "@/lib/write/scene";

/**
 * 细纲生成 API
 * POST /api/detailed-outline-generation
 *
 * 调用细纲生成 prompt，基于大纲 JSON 扩散为场景级细纲。
 */

export const maxDuration = 120;

const InputSchema = z.object({
  /** 大纲文本，可为结构化 JSON 字符串或可读文本 */
  outlineJson: z.string().min(1, "大纲文本不能为空"),
  coreGerm: z.string().optional(),
  wordCount: z.number().int().positive().optional(),
  hookType: z.string().optional(),
  goldenFinger: z.string().optional(),
  emotionGoal: z
    .object({
      startMood: z.number().min(-5).max(5).optional(),
      midMood: z.number().min(-5).max(5).optional(),
      endMood: z.number().min(-5).max(5).optional(),
      trend: z.string().optional(),
    })
    .optional(),
});

const ResultSchema = z.object({
  chapterBreakdown: z
    .array(
      z.object({
        chapterIndex: z.number().int().min(1),
        scenes: z
          .array(
            z.object({
              purpose: z.enum([
                "hook",
                "setup",
                "development",
                "confrontation",
                "climax",
                "resolution",
                "transition",
              ]),
              wordCount: z.number().int().positive(),
              content: z.string(),
              dialogue: z.string().optional(),
              emotionPoint: z.number().min(-5).max(5),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

function validate(data: unknown) {
  const result = ResultSchema.safeParse(data);
  if (result.success)
    return { success: true, data: result.data as DetailedOutlineResult };
  return { success: false, error: result.error };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputResult = InputSchema.safeParse(body);
    if (!inputResult.success) {
      return NextResponse.json(
        {
          error: "入参校验失败",
          detail: inputResult.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        { status: 400 },
      );
    }

    const userPrompt = buildDetailedOutlineGenerationUserPrompt(inputResult.data);
    const { data, raw } = await callLLMWithSchema<DetailedOutlineResult>({
      systemPrompt: DETAILED_OUTLINE_GENERATION_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.5,
      maxTokens: 8192,
      feature: "detailed-outline-generation",
      maxAttempts: 2,
      validate,
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        durationMs: raw.durationMs,
        tokens: raw.usage,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    if (message.includes("未配置")) {
      return NextResponse.json(
        {
          error: "LLM 服务未配置",
          hint: "请在 AI 管理页添加并激活一个模型",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "细纲生成失败", detail: message },
      { status: 500 },
    );
  }
}
