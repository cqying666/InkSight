import { NextRequest, NextResponse } from "next/server";
import {
  GuideAnalysisInputSchema,
  runGuideAnalysisPipeline,
} from "@/lib/analysis/guide-pipeline";

/**
 * 导语专项拆解 API
 * POST /api/guide-analysis
 *
 * Body: {
 *   text: string  // 导语文本（30-2000 字）
 * }
 *
 * 返回：导语分析 + 逐句拆解 + 导语诊断
 */

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const inputResult = GuideAnalysisInputSchema.safeParse(body);
    if (!inputResult.success) {
      return NextResponse.json(
        {
          error: "入参校验失败",
          detail: inputResult.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`
          ),
        },
        { status: 400 }
      );
    }

    const result = await runGuideAnalysisPipeline(inputResult.data);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        durationMs: result.durationMs,
        tokens: result.tokens,
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
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "导语分析失败", detail: message },
      { status: 500 }
    );
  }
}
