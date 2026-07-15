/**
 * 会话 Cookie 辅助（仅在 Node 运行时的 Route Handler / Server Component 中使用）
 *
 * Edge-safe 的 JWT 逻辑见 ./jwt.ts；本文件在其之上补充 next/headers 的 cookie 读写。
 * middleware 请直接导入 ./jwt.ts，不要导入本文件。
 */
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./constants";
import {
  signSession,
  verifySession,
  getSessionFromRequest,
  type SessionPayload,
} from "./jwt";

export type { SessionPayload };
export { signSession, verifySession, getSessionFromRequest };

/**
 * 在 Route Handler 中读取当前会话（依赖 next/headers 的 cookies()）
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** 写入会话 Cookie（登录成功时调用） */
export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** 清除会话 Cookie（登出时调用） */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
