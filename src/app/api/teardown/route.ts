import { NextRequest, NextResponse } from "next/server";
import { AnalysisInputSchema, runAnalysisPipeline } from "@/lib/analysis";

/**
 * 拆文+人设分析 API
 * POST /api/teardown
 *
 * Body: {
 *   text: string  // 小说全文
 * }
 *
 * 返回：拆文分析 + 人设分析（可降级）
 */

// 拆文+人设提示词复杂，LLM 生成 JSON 耗时较长，放宽路由超时上限
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 入参校验
    const inputResult = AnalysisInputSchema.safeParse(body);
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

    // 执行拆文+人设分析管线
    const result = await runAnalysisPipeline(inputResult.data);

    return NextResponse.json({
      success: true,
      plot: result.plot,
      character: result.character,
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
      { error: "分析失败", detail: message },
      { status: 500 }
    );
  }
}
