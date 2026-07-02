import { NextRequest, NextResponse } from "next/server";
import { runFeedbackPipeline, FeedbackInputSchema } from "@/lib/feedback";

/**
 * 拆解分析 API（三步反馈管线）
 * POST /api/teardown
 *
 * Body: {
 *   text: string,                          // 小说全文
 *   selfAssessment?: {                     // 可选自评
 *     hookRating?: 1-5,                    // 开头吸引力
 *     tensionPosition?: 0-1,               // 最有张力位置
 *     pace?: "fast"|"medium"|"slow"        // 整体节奏
 *   }
 * }
 *
 * 返回：拆解 + 诊断 + 反直觉发现 + 处方（可能降级）
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 入参校验
    const inputResult = FeedbackInputSchema.safeParse(body);
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

    // 执行三步反馈管线
    const result = await runFeedbackPipeline(inputResult.data);

    return NextResponse.json({
      success: true,
      teardown: result.teardown,
      type: result.type,
      diagnosis: result.diagnosis,
      counterIntuitive: result.counterIntuitive,
      prescription: result.prescription,
      meta: result.meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";

    // 降级：LLM 未配置
    if (message.includes("LLM_API_KEY") || message.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        {
          error: "LLM 服务未配置",
          hint: "请复制 .env.example 为 .env.local 并填入 LLM_API_KEY（DeepSeek）",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "拆解失败", detail: message },
      { status: 500 }
    );
  }
}
