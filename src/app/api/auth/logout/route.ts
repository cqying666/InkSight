import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

/**
 * 登出接口
 * POST /api/auth/logout
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
