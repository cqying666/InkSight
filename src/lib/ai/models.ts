/**
 * AI 模型接入配置存储层
 *
 * 多模型配置，支持多个模型同时启用（is_active=1）。
 * 服务端专用（直接读 better-sqlite3 同步接口）。
 *
 * 数据来源：SQLite ai_models 表
 */

import { getDb } from "@/lib/db";

export const PI_MODEL_API = "openai-completions" as const;
export type PiModelApi = typeof PI_MODEL_API;
export const DEFAULT_CONTEXT_WINDOW = 32_768;
export const DEFAULT_MAX_TOKENS = 16_384;

export interface AIModelConfig {
  id: string;
  name: string;
  /** 供应商标识：deepseek / opencode / openai / custom 等 */
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  /** Pi 运行时 API；当前管理员配置均经 OpenAI-compatible adapter 接入。 */
  piApi: PiModelApi;
  /** Pi Model 上下文窗口上限 */
  contextWindow: number;
  /** Pi Model 单次最大输出 */
  maxTokens: number;
  /** 是否允许 Pi Agent 申请低档推理 */
  supportsReasoning: boolean;
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
  pi_api?: string | null;
  context_window?: number | null;
  max_tokens?: number | null;
  supports_reasoning?: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToConfig(row: AIModelRow, masked = false): AIModelConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseURL: row.base_url,
    apiKey: masked ? maskApiKey(row.api_key) : row.api_key,
    model: row.model,
    piApi: PI_MODEL_API,
    contextWindow: normalizePositiveInt(row.context_window, DEFAULT_CONTEXT_WINDOW),
    maxTokens: normalizePositiveInt(row.max_tokens, DEFAULT_MAX_TOKENS),
    supportsReasoning: row.supports_reasoning === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 列出全部模型配置（apiKey 脱敏，默认脱敏） */
export function listModels(masked = true): AIModelConfig[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_models ORDER BY created_at ASC")
    .all() as AIModelRow[];
  return rows.map((r) => rowToConfig(r, masked));
}

/** 列出全部模型配置（apiKey 完整，仅服务端内部使用） */
export function listModelsInternal(): AIModelConfig[] {
  return listModels(false);
}

/** 获取当前启用的模型配置（取第一个 is_active=1）；无启用时返回 null；默认脱敏 apiKey */
export function getActiveModel(masked = true): AIModelConfig | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ai_models WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1")
    .get() as AIModelRow | undefined;
  return row ? rowToConfig(row, masked) : null;
}

/** 按 id 获取模型配置（默认脱敏 apiKey；masked=false 返回完整 key，仅限服务端内部使用） */
export function getModelById(id: string, masked = true): AIModelConfig | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM ai_models WHERE id = ?")
    .get(id) as AIModelRow | undefined;
  return row ? rowToConfig(row, masked) : null;
}

/** 列出全部已启用的模型配置（is_active=1），按创建时间正序 */
export function listActiveModels(masked = true): AIModelConfig[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_models WHERE is_active = 1 ORDER BY created_at ASC")
    .all() as AIModelRow[];
  return rows.map((r) => rowToConfig(r, masked));
}

export interface CreateModelInput {
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  piApi?: PiModelApi;
  contextWindow?: number;
  maxTokens?: number;
  supportsReasoning?: boolean;
  /** 创建时是否设为激活 */
  isActive?: boolean;
}

export function createModel(input: CreateModelInput, masked = true): AIModelConfig {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO ai_models (id, name, provider, base_url, api_key, model, pi_api, context_window, max_tokens, supports_reasoning, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.provider,
    input.baseURL,
    input.apiKey,
    input.model,
    PI_MODEL_API,
    normalizePositiveInt(input.contextWindow, DEFAULT_CONTEXT_WINDOW),
    normalizePositiveInt(input.maxTokens, DEFAULT_MAX_TOKENS),
    input.supportsReasoning ? 1 : 0,
    input.isActive ? 1 : 0,
    now,
    now
  );

  const row = db.prepare("SELECT * FROM ai_models WHERE id = ?").get(id) as AIModelRow;
  return rowToConfig(row, masked);
}

export interface UpdateModelInput {
  name?: string;
  provider?: string;
  baseURL?: string;
  apiKey?: string;
  model?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsReasoning?: boolean;
}

export function updateModel(id: string, input: UpdateModelInput, masked = true): AIModelConfig | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM ai_models WHERE id = ?")
    .get(id) as AIModelRow | undefined;
  if (!existing) return null;

  const next: AIModelRow = {
    ...existing,
    name: input.name && input.name.trim() ? input.name.trim() : existing.name,
    provider: input.provider && input.provider.trim() ? input.provider.trim() : existing.provider,
    base_url: input.baseURL && input.baseURL.trim() ? input.baseURL.trim() : existing.base_url,
    api_key: input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : existing.api_key,
    model: input.model && input.model.trim() ? input.model.trim() : existing.model,
    pi_api: PI_MODEL_API,
    context_window: normalizePositiveInt(input.contextWindow, normalizePositiveInt(existing.context_window, DEFAULT_CONTEXT_WINDOW)),
    max_tokens: normalizePositiveInt(input.maxTokens, normalizePositiveInt(existing.max_tokens, DEFAULT_MAX_TOKENS)),
    supports_reasoning: input.supportsReasoning === undefined
      ? existing.supports_reasoning ?? 0
      : input.supportsReasoning ? 1 : 0,
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE ai_models
     SET name = ?, provider = ?, base_url = ?, api_key = ?, model = ?, pi_api = ?, context_window = ?, max_tokens = ?, supports_reasoning = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    next.name,
    next.provider,
    next.base_url,
    next.api_key,
    next.model,
    next.pi_api,
    next.context_window,
    next.max_tokens,
    next.supports_reasoning,
    next.updated_at,
    id
  );

  return rowToConfig(next, masked);
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

function normalizePositiveInt(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  return Math.min(Math.max(rounded, 256), 1_000_000);
}
