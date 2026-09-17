import { NextRequest, NextResponse } from "next/server";
import { authenticate, ensureBootstrapAdmin } from "@/lib/auth/users";
import { signSession, getSessionCookieValue } from "@/lib/auth/session";

/**
 * 登录接口
 * POST /api/auth/login  body: { username, password }
 */
export async function POST(request: NextRequest) {
  try {
    ensureBootstrapAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message
            ? `系统初始化失败：${e.message}`
            : "系统初始化失败，请稍后重试或检查数据库/环境变量",
      },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }

  let user;
  try {
    user = authenticate(body.username.trim(), body.password);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登录校验失败，请稍后重试" },
      { status: 503 }
    );
  }
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signSession({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message
            ? `会话创建失败：${e.message}`
            : "会话创建失败，请检查服务端鉴权配置",
      },
      { status: 503 }
    );
  }

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
  });
  response.headers.append("Set-Cookie", getSessionCookieValue(token));
  return response;
}
