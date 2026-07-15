import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

/**
 * 当前会话信息
 * GET /api/auth/me
 *
 * 返回 { user } 或 { user: null }（未登录）
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: session.sub,
      username: session.username,
      role: session.role,
    },
  });
}
