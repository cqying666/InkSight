import { NextResponse } from "next/server";
import { getActiveModel } from "@/lib/ai/models";

/**
 * 健康检查接口
 * GET /api/health
 */

export async function GET() {
  let llmStatus: "configured" | "missing" = "missing";
  let llmModel = "";
  let llmBaseUrl = "";
  try {
    const active = getActiveModel();
    if (active && active.apiKey) {
      llmStatus = "configured";
      llmModel = active.model;
      llmBaseUrl = active.baseURL;
    }
  } catch {
    // DB 未初始化
  }

  return NextResponse.json({
    status: "ok",
    service: "InkSight 创作教练",
    config: {
      llm: llmStatus,
      llmModel,
      llmBaseUrl,
    },
    timestamp: new Date().toISOString(),
  });
}
