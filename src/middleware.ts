import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/jwt";

/**
 * 路由鉴权中间件
 *
 * 公开路径（无需登录）：
 *  - /login
 *  - /api/auth/*
 *  - /api/health
 *  - 静态资源（_next、favicon、图片/字体等）
 *
 * 仅管理员可访问（role === 'admin'）：
 *  - /ai-control（页面）
 *  - /api/ai-models、/api/ai-logs（AI 管理 API）
 *  - /api/admin/*（账户管理 API）
 *
 * 其余所有页面与 API 均要求登录。
 */

/** 仅管理员可访问的路径前缀 */
const ADMIN_PATHS = ["/ai-control", "/api/ai-models", "/api/ai-logs", "/api/admin"];

/** 完全公开的路径前缀 */
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 公开路径直接放行
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(req);

  // 未登录：API 返回 401，页面跳转到登录
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 已登录但访问管理员专属路径，且非管理员：
  // API 返回 403，页面跳转回首页
  if (isAdminPath(pathname) && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  // 排除静态资源、Next 内部资源与各类二进制文件
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|otf|eot)$).*)",
  ],
};
