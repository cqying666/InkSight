/**
 * 鉴权常量
 *
 * 角色定义：
 *  - admin      管理员：可访问 AI 管理（/ai-control）及所有功能
 *  - experience 体验账户：可使用全部创作功能，但 AI 管理对其不可见
 *
 * 注意：账户信息仅存储在数据库 users 表中，不在代码里硬编码任何凭据。
 * 管理员账户首次启动时从环境变量 bootstrap 写入数据库，之后完全以数据库为准。
 * 其他账户（含体验账户）由管理员在「AI 管理 → 账户」页面创建。
 */

export type Role = "admin" | "experience";

export const SESSION_COOKIE = "inksight_session";
/** 会话有效期 7 天（秒） */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * JWT 密钥：
 *  - 优先读取环境变量 INKSIGHT_JWT_SECRET
 *  - 未配置时使用内置默认值（仅适用于本地开发，生产环境必须配置环境变量）
 */
export function getJwtSecret(): Uint8Array {
  const secret =
    process.env.INKSIGHT_JWT_SECRET || "inksight-dev-jwt-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

/**
 * 管理员 bootstrap 配置（仅用于首次启动写入数据库）
 *  - 用户名来自 INKSIGHT_ADMIN_USERNAME（默认 admin）
 *  - 密码来自 INKSIGHT_ADMIN_PASSWORD；
 *    未配置时生成一次性随机密码并打印到服务端日志（仅本地开发用）
 * 生产环境必须通过环境变量显式指定管理员密码。
 */
export function getAdminBootstrap() {
  return {
    username: process.env.INKSIGHT_ADMIN_USERNAME || "admin",
    password: process.env.INKSIGHT_ADMIN_PASSWORD || null,
  };
}
