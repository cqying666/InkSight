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
  `);
}

/** 关闭数据库连接（仅用于测试） */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
