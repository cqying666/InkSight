import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLMWithSchema } from "@/lib/llm/client";
import {
  GUIDE_GENERATION_SYSTEM_PROMPT,
  buildGuideGenerationUserPrompt,
  type GuideGenerationResult,
} from "@/lib/write/guide-prompt";

/**
 * 导语生成 API
 * POST /api/guide-generation
 *
 * 调用导语生成 prompt，返回 3 个差异化候选导语。
 */

export const maxDuration = 120;

const InputSchema = z.object({
  theme: z.string().min(1, "题材不能为空"),
  coreGerm: z.string().optional(),
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
  wordCount: z.number().int().positive().optional(),
});

const CandidateSchema = z.object({
  hookType: z.string(),
  guideModel: z.string(),
  coreGerm: z.string(),
  lead: z.string(),
  hookNote: z.string(),
  emotionGoal: z.object({
    startMood: z.number(),
    midMood: z.number(),
    endMood: z.number(),
    trend: z.string(),
  }),
});

const ResultSchema = z.object({
  candidates: z.array(CandidateSchema).min(1),
});

function validate(data: unknown) {
  const result = ResultSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data as GuideGenerationResult };
  return {
    success: false,
    error: result.error,
  };
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

    const userPrompt = buildGuideGenerationUserPrompt(inputResult.data);
    const { data, raw } = await callLLMWithSchema<GuideGenerationResult>({
      systemPrompt: GUIDE_GENERATION_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.7,
      maxTokens: 4096,
      feature: "guide-generation",
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
      { error: "导语生成失败", detail: message },
      { status: 500 },
    );
  }
}
