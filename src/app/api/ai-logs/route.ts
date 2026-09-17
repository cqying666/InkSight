import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listLogs, getStats, clearLogs } from "@/lib/ai/logs";

async function requireAdmin(): Promise<Response | null> {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "鉴权失败" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return null;
}

/**
 * AI 调用与消耗记录 API
 *
 * GET    /api/ai-logs            — 查询日志（可选 limit / model / feature）
 * GET    /api/ai-logs?stats=1    — 仅返回聚合统计
 * DELETE /api/ai-logs            — 清空全部日志
 */

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
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
  const denied = await requireAdmin();
  if (denied) return denied;
  clearLogs();
  return NextResponse.json({ success: true });
}
