/**
 * AI 调用与消耗记录存储层
 *
 * 服务端专用。提供记录写入、查询、统计聚合、清空。
 *
 * 数据来源：SQLite ai_call_logs 表
 */

import { getDb } from "@/lib/db";

export interface AICallLog {
  id: number;
  ts: string;
  model: string;
  /** 功能标识：teardown / trend / prescription / analysis / coach 等 */
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  success: boolean;
  error: string | null;
}

interface AICallLogRow {
  id: number;
  ts: string;
  model: string;
  feature: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  success: number;
  error: string | null;
}

function rowToLog(row: AICallLogRow): AICallLog {
  return {
    id: row.id,
    ts: row.ts,
    model: row.model,
    feature: row.feature,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    success: row.success === 1,
    error: row.error,
  };
}

export interface LogCallInput {
  model: string;
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

/** 写入一条调用日志（不抛错，失败时静默，避免污染主调用链） */
export function logCall(input: LogCallInput): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO ai_call_logs (ts, model, feature, prompt_tokens, completion_tokens, total_tokens, duration_ms, success, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(),
      input.model,
      input.feature,
      input.promptTokens,
      input.completionTokens,
      input.totalTokens,
      input.durationMs,
      input.success ? 1 : 0,
      input.error ?? null
    );
  } catch {
    // 静默：日志失败不应影响主调用
  }
}

export interface ListLogsOptions {
  limit?: number;
  /** 按模型过滤 */
  model?: string;
  /** 按功能过滤 */
  feature?: string;
}

/** 列出日志，最新在前 */
export function listLogs(options: ListLogsOptions = {}): AICallLog[] {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.model) {
    where.push("model = ?");
    params.push(options.model);
  }
  if (options.feature) {
    where.push("feature = ?");
    params.push(options.feature);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT * FROM ai_call_logs ${whereClause} ORDER BY id DESC LIMIT ?`
    )
    .all(...params) as AICallLogRow[];
  return rows.map(rowToLog);
}

export interface AIStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number;
  byModel: Array<{ model: string; calls: number; totalTokens: number }>;
  byFeature: Array<{ feature: string; calls: number; totalTokens: number }>;
}

/** 聚合统计：总览 + 按模型 + 按功能 */
export function getStats(): AIStats {
  const db = getDb();

  const overall = db
    .prepare(
      `SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_calls,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_calls,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt,
        COALESCE(SUM(completion_tokens), 0) as total_completion,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(duration_ms), 0) as avg_duration
       FROM ai_call_logs`
    )
    .get() as {
    total_calls: number;
    success_calls: number;
    failed_calls: number;
    total_prompt: number;
    total_completion: number;
    total_tokens: number;
    avg_duration: number;
  };

  const byModelRows = db
    .prepare(
      `SELECT model, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as total_tokens
       FROM ai_call_logs GROUP BY model ORDER BY calls DESC`
    )
    .all() as { model: string; calls: number; total_tokens: number }[];

  const byFeatureRows = db
    .prepare(
      `SELECT feature, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as total_tokens
       FROM ai_call_logs GROUP BY feature ORDER BY calls DESC`
    )
    .all() as { feature: string; calls: number; total_tokens: number }[];

  return {
    totalCalls: overall.total_calls ?? 0,
    successCalls: overall.success_calls ?? 0,
    failedCalls: overall.failed_calls ?? 0,
    totalPromptTokens: overall.total_prompt ?? 0,
    totalCompletionTokens: overall.total_completion ?? 0,
    totalTokens: overall.total_tokens ?? 0,
    avgDurationMs: Math.round(overall.avg_duration ?? 0),
    byModel: byModelRows.map((r) => ({
      model: r.model,
      calls: r.calls,
      totalTokens: r.total_tokens,
    })),
    byFeature: byFeatureRows.map((r) => ({
      feature: r.feature,
      calls: r.calls,
      totalTokens: r.total_tokens,
    })),
  };
}

/** 清空全部日志 */
export function clearLogs(): void {
  const db = getDb();
  db.prepare("DELETE FROM ai_call_logs").run();
}
