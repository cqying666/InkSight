import { NextRequest, NextResponse } from "next/server";
import { authenticate, ensureBootstrapAdmin } from "@/lib/auth/users";
import { signSession, setSessionCookie } from "@/lib/auth/session";

/**
 * 登录接口
 * POST /api/auth/login  body: { username, password }
 */
export async function POST(request: NextRequest) {
  ensureBootstrapAdmin();
  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }

  const user = authenticate(body.username.trim(), body.password);
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
  });
}
