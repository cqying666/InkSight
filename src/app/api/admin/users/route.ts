import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listUsers,
  createUser,
  deleteUser,
  updateUserPassword,
} from "@/lib/auth/users";
import type { Role } from "@/lib/auth/constants";

/**
 * 账户管理 API（仅管理员）
 *
 * 路由层权限由 middleware 保证（/api/admin/* 仅 admin），此处再做一次
 * 会话校验作为纵深防御。
 *
 * GET    /api/admin/users              — 列出全部账户
 * POST   /api/admin/users              — 新建账户 { username, password, role, displayName? }
 * DELETE /api/admin/users?id=xxx       — 删除账户
 * PUT    /api/admin/users?id=xxx       — 修改账户（目前仅支持重置密码 { password }）
 */

function validatePassword(pwd: string): string | null {
  if (pwd.length < 6) return "密码至少 6 位";
  if (!/[a-zA-Z]/.test(pwd)) return "密码需包含字母";
  if (!/[0-9]/.test(pwd)) return "密码需包含数字";
  return null;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return NextResponse.json(listUsers());
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const { username, password, role, displayName } = body as {
    username?: string;
    password?: string;
    role?: string;
    displayName?: string | null;
  };

  if (
    typeof username !== "string" ||
    !username.trim() ||
    typeof password !== "string"
  ) {
    return NextResponse.json(
      { error: "用户名必填，密码至少 6 位且需包含字母和数字" },
      { status: 400 }
    );
  }

  const pwdErr = validatePassword(password);
  if (pwdErr) {
    return NextResponse.json({ error: pwdErr }, { status: 400 });
  }

  if (role !== "admin" && role !== "experience") {
    return NextResponse.json(
      { error: "角色必须为 admin 或 experience" },
      { status: 400 }
    );
  }

  try {
    const user = createUser({
      username,
      password,
      role: role as Role,
      displayName: typeof displayName === "string" ? displayName : null,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "创建失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const res = deleteUser(id, session.sub);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "新密码必填" },
      { status: 400 }
    );
  }

  const pwdErr = validatePassword(body.password);
  if (pwdErr) {
    return NextResponse.json(
      { error: pwdErr },
      { status: 400 }
    );
  }

  const result = updateUserPassword(id, body.password);
  if (!result.ok) {
    const status = result.reason === "账户不存在" ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ success: true });
}
