/**
 * SQLite 数据库单例
 *
 * 使用 better-sqlite3（同步 native 模块），仅在服务端运行。
 * 数据库文件：./data/inksight.db（已 gitignore）
 *
 * 表结构：
 *  - materials: 素材库（JSON blob 存储）
 *  - examples: 例文库（完整原文与可选拆文报告）
 *  - teardown_history: 拆文历史（JSON blob + 自增 id）
 *  - writing_documents: 创作文档（key-value，draft + documents）
 *  - analytics_events: 埋点事件（结构化列）
 *  - ai_models: AI 模型接入配置（多模型，单一激活）
 *  - ai_call_logs: AI 调用与消耗记录
 *  - users: 账户（用户名 + bcrypt 哈希密码 + 角色 admin/experience）
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;
let dbInitialized = false;

/**
 * 数据迁移：将历史上未隔离的数据迁移为用户命名空间隔离格式。
 *
 * 这是一次性迁移（记录在 data_migration_log 表）：
 *  1. materials / writing_documents / examples  — 主键加 `u:{userId}:` 前缀
 *  2. analytics_events / teardown_history      — 新增 user_id 列并回填
 *
 * 仅当存在管理员账户时执行；管理员尚未 bootstrap 时跳过，
 * 后续在 getDb() 调用时重试。
 */
function migrateUserDataScoping(db: Database.Database): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_migration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );
    `);
  } catch {
    // 表已存在
  }

  const MIGRATION_NAME = "user_scoped_keys_v1";
  const alreadyDone = db
    .prepare(`SELECT 1 FROM data_migration_log WHERE migration = ?`)
    .get(MIGRATION_NAME);
  if (alreadyDone) return;

  // 获取管理员用户 ID（首次 bootstrap 后必定存在）
  const admin = db
    .prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`)
    .get() as { id: string } | undefined;
  if (!admin) {
    // 管理员尚未 bootstrap，跳过，下次 getDb() 时重试
    return;
  }

  const userId = admin.id;
  const prefix = `u:${userId}:`;
  const now = new Date().toISOString();

  try {
    // --- materials: 主键加前缀 ---
    const unscopedMaterials = db
      .prepare(`SELECT id FROM materials WHERE id NOT LIKE 'u:%'`)
      .all() as { id: string }[];
    for (const row of unscopedMaterials) {
      const newId = prefix + row.id;
      const exists = db.prepare(`SELECT 1 FROM materials WHERE id = ?`).get(newId);
      if (!exists) {
        db.prepare(`UPDATE materials SET id = ? WHERE id = ?`).run(newId, row.id);
      }
    }

    // --- writing_documents: 主键加前缀 ---
    const unscopedDocs = db
      .prepare(`SELECT key FROM writing_documents WHERE key NOT LIKE 'u:%'`)
      .all() as { key: string }[];
    for (const row of unscopedDocs) {
      const newKey = prefix + row.key;
      const exists = db.prepare(`SELECT 1 FROM writing_documents WHERE key = ?`).get(newKey);
      if (!exists) {
        db.prepare(`UPDATE writing_documents SET key = ? WHERE key = ?`).run(newKey, row.key);
      }
    }

    // --- examples: 主键加前缀 ---
    const unscopedExamples = db
      .prepare(`SELECT id FROM examples WHERE id NOT LIKE 'u:%'`)
      .all() as { id: string }[];
    for (const row of unscopedExamples) {
      const newId = prefix + row.id;
      const exists = db.prepare(`SELECT 1 FROM examples WHERE id = ?`).get(newId);
      if (!exists) {
        db.prepare(`UPDATE examples SET id = ? WHERE id = ?`).run(newId, row.id);
      }
    }

    // --- analytics_events: 新增 user_id 列并回填 ---
    try {
      db.prepare(`ALTER TABLE analytics_events ADD COLUMN user_id TEXT`).run();
    } catch {
      // 列已存在
    }
    db.prepare(`UPDATE analytics_events SET user_id = ? WHERE user_id IS NULL`).run(userId);

    // --- teardown_history: 新增 user_id 列并回填 ---
    try {
      db.prepare(`ALTER TABLE teardown_history ADD COLUMN user_id TEXT`).run();
    } catch {
      // 列已存在
    }
    db.prepare(`UPDATE teardown_history SET user_id = ? WHERE user_id IS NULL`).run(userId);

    // --- 记录迁移完成 ---
    db.prepare(
      `INSERT INTO data_migration_log (migration, applied_at) VALUES (?, ?)`
    ).run(MIGRATION_NAME, now);

    // eslint-disable-next-line no-console
    console.info(
      `[db] 数据迁移 ${MIGRATION_NAME} 完成：materials ${unscopedMaterials.length} 条, ` +
      `writing_documents ${unscopedDocs.length} 条, examples ${unscopedExamples.length} 条`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[db] 数据迁移 ${MIGRATION_NAME} 失败：`, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "inksight.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  migrateUserDataScoping(db);

  if (!dbInitialized) {
    dbInitialized = true;
    process.on("exit", () => {
      if (db) {
        db.close();
      }
    });
    process.on("SIGINT", () => {
      if (db) {
        db.close();
      }
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      if (db) {
        db.close();
      }
      process.exit(0);
    });
  }

  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS examples (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teardown_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS writing_documents (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ts TEXT NOT NULL,
      sid TEXT NOT NULL,
      props TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts);
    CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(name);

    CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_models_active ON ai_models(is_active);

    CREATE TABLE IF NOT EXISTS ai_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      model TEXT NOT NULL,
      feature TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_logs_ts ON ai_call_logs(ts);
    CREATE INDEX IF NOT EXISTS idx_ai_logs_model ON ai_call_logs(model);
    CREATE INDEX IF NOT EXISTS idx_ai_logs_feature ON ai_call_logs(feature);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'experience',
      display_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS bootstrap_lock (
      key TEXT PRIMARY KEY,
      locked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      work_id TEXT NOT NULL,
      parent_id TEXT,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_work ON coach_sessions(user_id, work_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS coach_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES coach_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_coach_messages_session ON coach_messages(session_id, created_at ASC);
  `);

  ensureAiModelPiColumns(db);
}

/** 为既有管理员模型配置补齐 Pi Model 规格，避免重建或清空用户的 API Key。 */
function ensureAiModelPiColumns(db: Database.Database): void {
  const columns = [
    "ALTER TABLE ai_models ADD COLUMN pi_api TEXT NOT NULL DEFAULT 'openai-completions'",
    "ALTER TABLE ai_models ADD COLUMN context_window INTEGER NOT NULL DEFAULT 32768",
    "ALTER TABLE ai_models ADD COLUMN max_tokens INTEGER NOT NULL DEFAULT 16384",
    "ALTER TABLE ai_models ADD COLUMN supports_reasoning INTEGER NOT NULL DEFAULT 0",
  ];
  for (const statement of columns) {
    try {
      db.prepare(statement).run();
    } catch {
      // SQLite 对重复 ADD COLUMN 报错；列已存在时可安全忽略。
    }
  }
}

/** 关闭数据库连接（仅用于测试） */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
