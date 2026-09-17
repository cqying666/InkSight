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
import { checkUserExists } from "./users";

export type { SessionPayload };
export { signSession, verifySession, getSessionFromRequest };

/**
 * 在 Route Handler 中读取当前会话（依赖 next/headers 的 cookies()）
 *
 * 验证流程：
 * 1. 验证 JWT token 有效性
 * 2. 检查用户是否仍然存在于数据库中（防止已删除用户的 token 继续有效）
 *
 * 契约：本函数**永不抛异常**，任何失败都返回 null。
 *  - cookies() 在 SSR / 错误的运行时环境下会抛；
 *  - ensureBootstrapAdmin() 在事务失败时会抛；
 *  - checkUserExists() / verifySession() 任何环节的底层 DB/JWT 错误都被吞掉，
 *    调用方可安全地 `const session = await getSession()` 而无需 try/catch。
 * 若数据库暂时不可用但 JWT 有效，放行当前请求（降级）并打印警告。
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const payload = await verifySession(token);
    if (!payload) return null;

    let exists: boolean;
    try {
      exists = checkUserExists(payload.sub);
    } catch (e) {
      // 数据库临时不可用时（如磁盘 I/O 抖动），不能强制注销所有用户。
      // JWT 签名已经过验证，允许请求继续；下次请求将重试数据库检查。
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] checkUserExists 数据库查询失败，放行当前请求：",
        e instanceof Error ? e.message : String(e)
      );
      exists = true;
    }
    if (!exists) return null; // 用户已被删除
    return payload;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] getSession 发生未预期异常，按未登录处理：",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/** 生成会话 Cookie 值（用于在 Response 中设置） */
export function getSessionCookieValue(token: string): string {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    `Path=/`,
    `Max-Age=${SESSION_MAX_AGE}`,
  ].filter(Boolean);
  return parts.join("; ");
}

/** 生成清除会话 Cookie 的值 */
export function getClearSessionCookieValue(): string {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].filter(Boolean);
  return parts.join("; ");
}
