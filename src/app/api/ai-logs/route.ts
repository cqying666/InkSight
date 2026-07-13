import { NextRequest, NextResponse } from "next/server";
import { listLogs, getStats, clearLogs } from "@/lib/ai/logs";

/**
 * AI 调用与消耗记录 API
 *
 * GET    /api/ai-logs            — 查询日志（可选 limit / model / feature）
 * GET    /api/ai-logs?stats=1    — 仅返回聚合统计
 * DELETE /api/ai-logs            — 清空全部日志
 */

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  if (sp.get("stats") === "1") {
    const stats = getStats();
    return NextResponse.json(stats);
  }

  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const model = sp.get("model") || undefined;
  const feature = sp.get("feature") || undefined;

  const logs = listLogs({
    limit: limit && Number.isFinite(limit) ? limit : undefined,
    model,
    feature,
  });
  return NextResponse.json(logs);
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ success: true });
}
