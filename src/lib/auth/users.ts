/**
 * 用户存储层 + 管理员 bootstrap + 账户 CRUD
 *
 * 表：users（见 src/lib/db/index.ts）
 *
 * 凭据策略：不在代码里硬编码任何账户。
 *  - 管理员账户首次启动时从环境变量 INKSIGHT_ADMIN_USERNAME / INKSIGHT_ADMIN_PASSWORD
 *    bootstrap 写入数据库（未配置密码时生成一次性随机密码并打印到服务端日志）。
 *  - 其余账户（含体验账户）由管理员在「AI 管理 → 账户」页面创建。
 *  - bootstrap 仅在 users 表为空时执行；之后完全以数据库为准。
 */
import { randomUUID, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { getAdminBootstrap, type Role } from "./constants";
import { hashPassword, verifyPassword } from "./password";

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 列表项（不含密码哈希） */
export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  displayName: string | null;
  createdAt: string;
}

const BOOTSTRAP_LOCK_KEY = "admin_bootstrap";

const userExistsCache = new Map<string, boolean>();
const MAX_CACHE_SIZE = 500;

function invalidateUserCache(userId: string): void {
  userExistsCache.delete(userId);
}

function trimCacheIfNeeded(): void {
  while (userExistsCache.size > MAX_CACHE_SIZE) {
    // 按插入顺序驱逐最旧的条目，避免全量驱逐导致的鉴权雪崩
    const firstKey = userExistsCache.keys().next().value;
    if (!firstKey) break;
    userExistsCache.delete(firstKey);
  }
}

/** 生成一次性随机密码（本地开发兜底） */
function generateRandomPassword(): string {
  return randomBytes(8).toString("hex");
}

/**
 * 首次启动时 bootstrap 管理员账户（仅当 users 表为空时执行）
 * 已有账户时不做任何事，保证幂等且不覆盖已设置的密码。
 * 
 * 使用数据库锁确保并发安全：多个进程同时启动时，只有一个能成功写入管理员账户。
 */
/**
 * 进程级 bootstrap 标志：已确认系统至少有一个管理员存在，
 * 后续调用跳过对 bootstrap_lock / users COUNT 的查询。
 * 这避免了把同步 SQL 查询放到每条鉴权请求的热路径上。
 */
let bootstrapVerified = false;

export function ensureBootstrapAdmin() {
  const db = getDb();

  if (bootstrapVerified) {
    return;
  }

  const existingLock = db
    .prepare(`SELECT key FROM bootstrap_lock WHERE key = ?`)
    .get(BOOTSTRAP_LOCK_KEY) as { key: string } | undefined;

  const count = db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number };

  // 孤儿锁：进程曾在 bootstrap 中途崩溃（用户写入/锁写入之间）。
  // 此时锁存在但 users 表为空，必须清理锁并重新 bootstrap，
  // 否则系统将永久无法初始化管理员账户。
  if (existingLock && count.c === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] 检测到孤儿 bootstrap_lock（先前进程可能在初始化管理员时崩溃），正在清理并重新 bootstrap。"
    );
    try {
      db.prepare(`DELETE FROM bootstrap_lock WHERE key = ?`).run(BOOTSTRAP_LOCK_KEY);
    } catch {
    }
  } else if (existingLock || count.c > 0) {
    bootstrapVerified = true;
    return;
  }

  const cfg = getAdminBootstrap();
  const password = cfg.password || generateRandomPassword();
  if (!cfg.password) {
    // eslint-disable-next-line no-console
    console.warn(
      `[auth] 未配置 INKSIGHT_ADMIN_PASSWORD，已为管理员「${cfg.username}」生成一次性随机密码：${password}\n` +
        `[auth] 生产环境请通过环境变量 INKSIGHT_ADMIN_USERNAME / INKSIGHT_ADMIN_PASSWORD 显式指定。`
    );
  }

  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, username, password_hash, role, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), cfg.username, hashPassword(password), "admin", "管理员", now, now);
      db.prepare(`INSERT INTO bootstrap_lock (key, locked_at) VALUES (?, ?)`).run(
        BOOTSTRAP_LOCK_KEY,
        now
      );
    })();
    bootstrapVerified = true;
  } catch {
    // Race: another process bootstrapped the admin between our check and the transaction.
    // Verify whether the admin now exists; if so, this is safe.
    const verifyCount = db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number };
    if (verifyCount.c === 0) {
      throw new Error("无法初始化管理员账户，数据库写入失败");
    }
    bootstrapVerified = true;
  }
}

/** 按用户名查询用户（含密码哈希，仅供鉴权使用） */
function getUserByUsername(username: string): {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  displayName: string | null;
} | null {
  ensureBootstrapAdmin();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, username, password_hash, role, display_name FROM users WHERE username = ?`
    )
    .get(username) as
    | {
        id: string;
        username: string;
        password_hash: string;
        role: string;
        display_name: string | null;
      }
    | undefined;
  if (!row) return null;
  if (row.role !== "admin" && row.role !== "experience") return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    displayName: row.display_name,
  };
}

/** 按用户名验证凭据，成功返回不含密码的用户信息 */
export function authenticate(
  username: string,
  password: string
): Omit<UserRecord, "createdAt" | "updatedAt"> | null {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  };
}

/** 检查用户是否存在（用于 token 验证后的用户状态检查）。
 * 仅缓存存在的用户（true），不缓存不存在的结果，
 * 避免删除用户后缓存残留导致的鉴权绕过。
 */
export function checkUserExists(userId: string): boolean {
  if (userExistsCache.has(userId)) {
    return userExistsCache.get(userId)!;
  }
  ensureBootstrapAdmin();
  const db = getDb();
  const row = db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .get(userId) as { id: string } | undefined;
  const exists = !!row;
  if (exists) {
    userExistsCache.set(userId, true);
    trimCacheIfNeeded();
  }
  return exists;
}

// ---------------------------------------------------------------------------
// 账户管理 CRUD（仅管理员可调用，权限校验在 API 层完成）
// ---------------------------------------------------------------------------

/** 列出全部账户（不含密码哈希） */
export function listUsers(): PublicUser[] {
  ensureBootstrapAdmin();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, username, role, display_name, created_at FROM users ORDER BY created_at ASC`
    )
    .all() as Array<{
    id: string;
    username: string;
    role: string;
    display_name: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role as Role,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
  displayName?: string | null;
}

/** 创建账户，返回新建账户（不含密码）。用户名重复时抛错。 */
export function createUser(input: CreateUserInput): PublicUser {
  ensureBootstrapAdmin();
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.username.trim(),
      hashPassword(input.password),
      input.role,
      input.displayName?.trim() || null,
      now,
      now
    );
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg.includes("UNIQUE")) {
      throw new Error("用户名已存在");
    }
    throw e;
  }
  invalidateUserCache(id);
  return {
    id,
    username: input.username.trim(),
    role: input.role,
    displayName: input.displayName?.trim() || null,
    createdAt: now,
  };
}

/** 删除账户。不允许删除最后一个管理员，不允许删除当前登录账户。 */
export function deleteUser(
  id: string,
  currentUserId?: string
): { ok: true } | { ok: false; reason: string } {
  ensureBootstrapAdmin();
  const db = getDb();
  const row = db
    .prepare(`SELECT id, role FROM users WHERE id = ?`)
    .get(id) as { id: string; role: string } | undefined;
  if (!row) return { ok: false, reason: "账户不存在" };

  if (currentUserId && id === currentUserId) {
    return { ok: false, reason: "不能删除当前登录账户" };
  }

  if (row.role === "admin") {
    const adminCount = db
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`)
      .get() as { c: number };
    if (adminCount.c <= 1) {
      return { ok: false, reason: "不能删除最后一个管理员账户" };
    }
  }

  invalidateUserCache(id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  return { ok: true };
}

/** 修改账户密码。 */
export function updateUserPassword(id: string, newPassword: string): { ok: true } | { ok: false; reason: string } {
  ensureBootstrapAdmin();
  const db = getDb();

  const row = db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .get(id) as { id: string } | undefined;
  if (!row) return { ok: false, reason: "账户不存在" };

  const now = new Date().toISOString();
  const res = db
    .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hashPassword(newPassword), now, id);
  if (res.changes > 0) {
    invalidateUserCache(id);
    return { ok: true };
  }
  return { ok: false, reason: "更新失败" };
}
