import { NextResponse } from "next/server";
import { getClearSessionCookieValue } from "@/lib/auth/session";

/**
 * 登出接口
 * POST /api/auth/logout
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.append("Set-Cookie", getClearSessionCookieValue());
  return response;
}
