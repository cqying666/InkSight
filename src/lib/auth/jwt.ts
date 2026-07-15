/**
 * 会话 JWT 签发与校验（jose，兼容 Edge / middleware 运行时）
 *
 * 本模块仅依赖 jose + constants，不引入 next/headers 或 better-sqlite3，
 * 因此可在 middleware（Edge Runtime）中安全导入。
 *
 * JWT payload：
 *  - sub:       用户 id
 *  - username:  用户名
 *  - role:      角色（admin / experience）
 */
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  getJwtSecret,
  type Role,
} from "./constants";

export interface SessionPayload {
  sub: string;
  username: string;
  role: Role;
}

/** 签发 JWT */
export async function signSession(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE)
    .sign(getJwtSecret());
}

/** 校验 JWT，失败返回 null */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "admin" && payload.role !== "experience")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/**
 * 在 middleware（Edge）中从 NextRequest 读取会话
 */
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
