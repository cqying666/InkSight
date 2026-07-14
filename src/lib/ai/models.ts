/**
 * AI 模型接入配置存储层
 *
 * 多模型配置，支持多个模型同时启用（is_active=1）。
 * 服务端专用（直接读 better-sqlite3 同步接口）。
 *
 * 数据来源：SQLite ai_models 表
 */

import { getDb } from "@/lib/db";

export interface AIModelConfig {
  id: string;
  name: string;
  /** 供应商标识：deepseek / opencode / openai / custom 等 */
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AIModelRow {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: AIModelRow): AIModelConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseURL: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 列出全部模型配置（apiKey 脱敏） */
export function listModels(): AIModelConfig[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_models ORDER BY created_at ASC")
    .all() as AIModelRow[];
  return rows.map(rowToConfig);
}

/** 列出全部模型配置（apiKey 完整，仅服务端内部使用） */
export function listModelsInternal(): AIModelConfig[] {
  return listModels();
}

/** 获取当前启用的模型配置（取第一个 is_active=1）；无启用时返回 null */
export function getActiveModel(): AIModelConfig | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ai_models WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1")
    .get() as AIModelRow | undefined;
  return row ? rowToConfig(row) : null;
}

/** 列出全部已启用的模型配置（is_active=1），按创建时间正序 */
export function listActiveModels(): AIModelConfig[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_models WHERE is_active = 1 ORDER BY created_at ASC")
    .all() as AIModelRow[];
  return rows.map(rowToConfig);
}

export interface CreateModelInput {
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  /** 创建时是否设为激活 */
  isActive?: boolean;
}

export function createModel(input: CreateModelInput): AIModelConfig {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO ai_models (id, name, provider, base_url, api_key, model, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.provider,
    input.baseURL,
    input.apiKey,
    input.model,
    input.isActive ? 1 : 0,
    now,
    now
  );

  const row = db.prepare("SELECT * FROM ai_models WHERE id = ?").get(id) as AIModelRow;
  return rowToConfig(row);
}

export interface UpdateModelInput {
  name?: string;
  provider?: string;
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

export function updateModel(id: string, input: UpdateModelInput): AIModelConfig | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM ai_models WHERE id = ?")
    .get(id) as AIModelRow | undefined;
  if (!existing) return null;

  const next: AIModelRow = {
    ...existing,
    name: input.name ?? existing.name,
    provider: input.provider ?? existing.provider,
    base_url: input.baseURL ?? existing.base_url,
    api_key: input.apiKey ?? existing.api_key,
    model: input.model ?? existing.model,
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE ai_models SET name = ?, provider = ?, base_url = ?, api_key = ?, model = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.name,
    next.provider,
    next.base_url,
    next.api_key,
    next.model,
    next.updated_at,
    id
  );

  return rowToConfig(next);
}

/**
 * 设置某模型的启用状态（不影响其他模型）
 * @param id 模型 id
 * @param active true=启用 / false=禁用
 */
export function setModelActive(id: string, active: boolean): boolean {
  const db = getDb();
  const existing = db
    .prepare("SELECT 1 FROM ai_models WHERE id = ?")
    .get(id);
  if (!existing) return false;

  db.prepare("UPDATE ai_models SET is_active = ?, updated_at = ? WHERE id = ?").run(
    active ? 1 : 0,
    new Date().toISOString(),
    id
  );
  return true;
}

export function deleteModel(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM ai_models WHERE id = ?").run(id);
  return result.changes > 0;
}

/** 脱敏 API Key：仅显示后 4 位 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return "••••" + key.slice(-4);
}

function generateId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
