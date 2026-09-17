import { NextRequest, NextResponse } from "next/server";
import {
  GuideAnalysisInputSchema,
  runGuideAnalysisPipeline,
} from "@/lib/analysis/guide-pipeline";
import { getSession } from "@/lib/auth/session";

async function requireAuth(): Promise<Response | null> {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "鉴权失败" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return null;
}

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
  const denied = await requireAuth();
  if (denied) return denied;
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
