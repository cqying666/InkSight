/**
 * 密码哈希工具（bcryptjs，纯 JS 实现，可在 Node 运行时使用）
 */
import bcrypt from "bcryptjs";

const SALT_ROUNUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}
