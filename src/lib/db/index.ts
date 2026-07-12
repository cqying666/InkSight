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
  `);
}

/** 关闭数据库连接（仅用于测试） */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
