import { NextRequest, NextResponse } from "next/server";

/**
 * 健康检查接口
 * GET /api/health
 */

export async function GET() {
  const hasLLM = !!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  return NextResponse.json({
    status: "ok",
    service: "InkSight 创作教练",
    phase: "Phase 0 — 管线骨架",
    config: {
      llm: hasLLM ? "configured" : "missing",
      llmModel: process.env.LLM_MODEL || "deepseek-chat",
      llmBaseUrl: process.env.LLM_BASE_URL || "https://api.deepseek.com",
      supabase: hasSupabase ? "configured" : "missing",
    },
    timestamp: new Date().toISOString(),
  });
}
