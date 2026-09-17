import { NextRequest, NextResponse } from "next/server";
import { buildIndex, isIndexReady } from "@/lib/material/zvec-index";
import { getSession } from "@/lib/auth/session";

async function requireAdmin() {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "鉴权失败" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "admin")
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  return session;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!(auth && "sub" in auth)) return auth as Response;
  try {
    return NextResponse.json({
      ready: isIndexReady(),
      message: "索引服务可用",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ready: false,
        error: err instanceof Error ? err.message : "索引服务不可用",
      },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  const auth = await requireAdmin();
  if (!(auth && "sub" in auth)) return auth as Response;
  try {
    const result = await buildIndex();
    return NextResponse.json({
      success: true,
      ...result,
      message: `索引构建完成：共 ${result.indexed}/${result.total} 条素材`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "索引构建失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
