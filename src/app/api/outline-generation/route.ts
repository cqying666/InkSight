import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLMWithSchema } from "@/lib/llm/client";
import {
  OUTLINE_GENERATION_SYSTEM_PROMPT,
  buildOutlineGenerationUserPrompt,
} from "@/lib/write/outline-prompt";
import type { OutlineGenerationResult } from "@/lib/write/chapter";

/**
 * 大纲生成 API
 * POST /api/outline-generation
 *
 * 调用大纲生成 prompt，返回结构化大纲 + 章节大纲。
 */

export const maxDuration = 120;

const InputSchema = z.object({
  theme: z.string().min(1, "题材不能为空"),
  coreGerm: z.string().min(1, "核心梗不能为空"),
  wordCount: z.number().int().positive(),
  goldenFinger: z.string().optional(),
  hookType: z.string().optional(),
  emotionGoal: z
    .object({
      startMood: z.number().min(-5).max(5).optional(),
      midMood: z.number().min(-5).max(5).optional(),
      endMood: z.number().min(-5).max(5).optional(),
      trend: z.string().optional(),
    })
    .optional(),
  benchmark: z.string().optional(),
  threeActRatio: z
    .object({
      setup: z.number().min(0).max(1).optional(),
      confrontation: z.number().min(0).max(1).optional(),
      resolution: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const ResultSchema = z.object({
  coreGerm: z.string(),
  goldenFinger: z.string().optional(),
  hookType: z.string(),
  hookNote: z.string(),
  threeActRatio: z.object({
    setup: z.number(),
    confrontation: z.number(),
    resolution: z.number(),
  }),
  reversals: z
    .array(
      z.object({
        position: z.number().min(0).max(1),
        type: z.enum(["plot", "cognition", "emotion"]),
        note: z.string(),
      }),
    )
    .min(1),
  endingType: z.enum([
    "twist",
    "open",
    "circular",
    "tragic",
    "happy",
    "ambiguous",
  ]),
  emotionGoal: z.object({
    startMood: z.number(),
    midMood: z.number(),
    endMood: z.number(),
    trend: z.string(),
  }),
  chapters: z
    .array(
      z.object({
        index: z.number().int().min(1),
        title: z.string(),
        wordCount: z.number().int().positive(),
        purpose: z.enum([
          "hook",
          "setup",
          "development",
          "confrontation",
          "climax",
          "resolution",
          "transition",
        ]),
        summary: z.string(),
        keyEvents: z.array(z.string()).min(1),
      }),
    )
    .min(2),
});

function validate(data: unknown) {
  const result = ResultSchema.safeParse(data);
  if (result.success)
    return { success: true, data: result.data as OutlineGenerationResult };
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

    const userPrompt = buildOutlineGenerationUserPrompt(inputResult.data);
    const { data, raw } = await callLLMWithSchema<OutlineGenerationResult>({
      systemPrompt: OUTLINE_GENERATION_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.5,
      maxTokens: 6144,
      feature: "outline-generation",
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
      { error: "大纲生成失败", detail: message },
      { status: 500 },
    );
  }
}
