"use client";

import { useState, useEffect, useCallback } from "react";
import { ModelEditSheet, type AIModelFormData } from "@/components/ai-control/ModelEditSheet";
import { trackEvent } from "@/lib/report/analytics";

/**
 * AI 管理页
 *
 * 三个区块：
 *  1. 调用消耗总览（总调用 / 成功率 / 总 token / 平均耗时）
 *  2. 模型接入管理（新增 / 编辑 / 删除 / 设为激活）
 *  3. 调用记录（按模型 / 功能筛选，最近 200 条）
 *
 * 数据来源：
 *  - 模型：SQLite ai_models 表（通过 /api/ai-models）
 *  - 日志与统计：SQLite ai_call_logs 表（通过 /api/ai-logs）
 *
 * 当无数据时，统计区显示 0（不显示空状态提示），符合用户偏好。
 */

interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string; // 已脱敏
  model: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AIStats {
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

interface AICallLog {
  id: number;
  ts: string;
  model: string;
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  success: boolean;
  error: string | null;
}

/** 功能标识 → 中文标签 */
const FEATURE_LABELS: Record<string, string> = {
  teardown: "拆文",
  "type-detection": "类型识别",
  analysis: "X 光分析",
  trend: "趋势分类",
  prescription: "处方生成",
  "coach-draft": "教练·正文",
  "coach-benchmark": "教练·对标文",
  "coach-outline": "教练·大纲",
  "coach-synopsis": "教练·细纲",
  "coach-characters": "教练·人物",
  general: "其他",
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] || feature;
}

/** 供应商 → 中文标签 */
const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  opencode: "OpenCode Zen",
  openai: "OpenAI",
  custom: "自定义",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] || provider;
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return ts;
  }
}

export default function AIControlPage() {
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [stats, setStats] = useState<AIStats | null>(null);
  const [logs, setLogs] = useState<AICallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // 日志筛选
  const [filterModel, setFilterModel] = useState<string>("");
  const [filterFeature, setFilterFeature] = useState<string>("");

  // 编辑浮层
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelFormData | null>(null);

  const reloadAll = useCallback(async () => {
    const [modelsRes, statsRes, logsRes] = await Promise.all([
      fetch("/api/ai-models"),
      fetch("/api/ai-logs?stats=1"),
      fetch("/api/ai-logs?limit=200"),
    ]);
    if (modelsRes.ok) setModels(await modelsRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
    if (logsRes.ok) setLogs(await logsRes.json());
  }, []);

  const reloadLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (filterModel) params.set("model", filterModel);
    if (filterFeature) params.set("feature", filterFeature);
    const res = await fetch(`/api/ai-logs?${params.toString()}`);
    if (res.ok) setLogs(await res.json());
  }, [filterModel, filterFeature]);

  useEffect(() => {
    trackEvent("ai_control_viewed", {});
    (async () => {
      await reloadAll();
      setLoading(false);
    })();
  }, [reloadAll]);

  useEffect(() => {
    reloadLogs();
  }, [reloadLogs]);

  const handleAdd = () => {
    setEditingModel(null);
    setSheetOpen(true);
  };

  const handleEdit = (m: AIModelConfig) => {
    setEditingModel({
      id: m.id,
      name: m.name,
      provider: m.provider,
      baseURL: m.baseURL,
      apiKey: "",
      model: m.model,
      isActive: m.isActive,
    });
    setSheetOpen(true);
  };

  const handleToggleActive = async (m: AIModelConfig) => {
    try {
      const nextActive = !m.isActive;
      const res = await fetch(
        `/api/ai-models?id=${encodeURIComponent(m.id)}&action=activate&value=${nextActive ? "true" : "false"}`,
        { method: "PUT" }
      );
      if (res.ok) {
        await reloadAll();
      }
    } catch {
      // 静默
    }
  };

  const handleDelete = async (m: AIModelConfig) => {
    if (!confirm(`确定删除模型「${m.name}」吗？`)) return;
    try {
      const res = await fetch(
        `/api/ai-models?id=${encodeURIComponent(m.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await reloadAll();
      }
    } catch {
      // 静默
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("确定清空全部调用记录吗？此操作不可恢复。")) return;
    try {
      const res = await fetch("/api/ai-logs", { method: "DELETE" });
      if (res.ok) {
        await reloadAll();
      }
    } catch {
      // 静默
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-bg px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  const successRate =
    stats && stats.totalCalls > 0
      ? ((stats.successCalls / stats.totalCalls) * 100).toFixed(1)
      : "0";

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="font-display text-title-xl font-bold text-text">
            AI 管理
          </h1>
          <p className="mt-1 text-xs text-text-muted">
            管理 AI 模型接入 · 查看调用与消耗
          </p>
        </div>

        {/* 调用消耗总览 */}
        <section className="mb-8">
          <h2 className="mb-3 font-display text-base font-semibold text-text">
            调用消耗总览
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总调用" value={formatNumber(stats?.totalCalls ?? 0)} />
            <StatCard label="成功率" value={`${successRate}%`} />
            <StatCard
              label="总 Token"
              value={formatNumber(stats?.totalTokens ?? 0)}
              accent
            />
            <StatCard
              label="平均耗时"
              value={formatDuration(stats?.avgDurationMs ?? 0)}
            />
          </div>
          {/* 二级统计：prompt / completion 拆分 */}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-text-muted">
            <span>
              输入 {formatNumber(stats?.totalPromptTokens ?? 0)}
            </span>
            <span>
              输出 {formatNumber(stats?.totalCompletionTokens ?? 0)}
            </span>
            <span>
              失败 {formatNumber(stats?.failedCalls ?? 0)}
            </span>
          </div>
        </section>

        {/* 模型接入管理 */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-text">
              模型接入
            </h2>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md bg-primary px-3 py-1.5 font-serif text-sm text-text-inverse transition-opacity hover:opacity-90"
            >
              + 新增模型
            </button>
          </div>

          {models.length === 0 ? (
            <div className="rounded-lg border border-dashed border-text/[0.12] bg-surface/50 px-5 py-8 text-center">
              <p className="font-serif text-sm text-text-muted">
                还没有配置 AI 模型
              </p>
              <p className="mt-1 font-serif text-xs text-text-muted/70">
                新增一个模型后，所有 AI 调用将使用此配置；未配置时回退到环境变量
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  onEdit={() => handleEdit(m)}
                  onToggleActive={() => handleToggleActive(m)}
                  onDelete={() => handleDelete(m)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 按模型 / 按功能 拆分 */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BreakdownCard
            title="按模型"
            items={(stats?.byModel ?? []).map((b) => ({
              key: b.model,
              calls: b.calls,
              totalTokens: b.totalTokens,
            }))}
          />
          <BreakdownCard
            title="按功能"
            items={(stats?.byFeature ?? []).map((b) => ({
              key: featureLabel(b.feature),
              calls: b.calls,
              totalTokens: b.totalTokens,
            }))}
          />
        </section>

        {/* 调用记录 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-text">
              调用记录
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                className="rounded-md border border-text/[0.12] bg-surface px-2 py-1 font-serif text-xs text-text outline-none focus:border-accent"
              >
                <option value="">全部模型</option>
                {(stats?.byModel ?? []).map((b) => (
                  <option key={b.model} value={b.model}>
                    {b.model}
                  </option>
                ))}
              </select>
              <select
                value={filterFeature}
                onChange={(e) => setFilterFeature(e.target.value)}
                className="rounded-md border border-text/[0.12] bg-surface px-2 py-1 font-serif text-xs text-text outline-none focus:border-accent"
              >
                <option value="">全部功能</option>
                {(stats?.byFeature ?? []).map((b) => (
                  <option key={b.feature} value={b.feature}>
                    {featureLabel(b.feature)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleClearLogs}
                className="rounded-md px-2 py-1 font-serif text-xs text-text-muted transition-colors hover:bg-bg-soft hover:text-[#9C4B3C]"
              >
                清空
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-lg border border-text/[0.06] bg-surface/50 px-5 py-8 text-center">
              <p className="font-serif text-sm text-text-muted">
                暂无调用记录
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-text/[0.06]">
              <table className="w-full text-left">
                <thead className="bg-bg-soft/60">
                  <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">模型</th>
                    <th className="px-3 py-2 font-medium">功能</th>
                    <th className="px-3 py-2 text-right font-medium">Token</th>
                    <th className="px-3 py-2 text-right font-medium">耗时</th>
                    <th className="px-3 py-2 text-center font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text/[0.04]">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="font-serif text-xs text-text/80 hover:bg-bg-soft/40"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-text-muted">
                        {formatTime(log.ts)}
                      </td>
                      <td className="px-3 py-2">{log.model}</td>
                      <td className="px-3 py-2">
                        {featureLabel(log.feature)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatNumber(log.totalTokens)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">
                        {formatDuration(log.durationMs)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {log.success ? (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                        ) : (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#9C4B3C]" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ModelEditSheet
        open={sheetOpen}
        initial={editingModel}
        onClose={() => setSheetOpen(false)}
        onSaved={reloadAll}
      />
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-text/[0.06] bg-surface px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
        {label}
      </div>
      <div
        className={`mt-1 text-3xl font-bold tabular-nums ${
          accent ? "text-[#9C4B3C]" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  model: AIModelConfig;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-text/[0.06] bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-sm font-semibold text-text">
              {model.name}
            </span>
            {model.isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/[0.12] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                已启用
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-text/[0.05] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                <span className="inline-block h-1 w-1 rounded-full border border-text-muted" />
                未启用
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-text-muted">
            <span>{providerLabel(model.provider)}</span>
            <span>{model.model}</span>
            <span className="text-text-muted/70">{model.apiKey}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-text-muted/60">
            {model.baseURL}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleActive}
            title={model.isActive ? "禁用" : "启用"}
            className={`rounded-md px-2 py-1 font-serif text-xs transition-colors ${
              model.isActive
                ? "text-text-muted hover:bg-bg-soft hover:text-[#9C4B3C]"
                : "text-accent hover:bg-accent/[0.08]"
            }`}
          >
            {model.isActive ? "禁用" : "启用"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="编辑"
            className="rounded-md px-2 py-1 font-serif text-xs text-text-muted transition-colors hover:bg-bg-soft hover:text-text"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="删除"
            className="rounded-md px-2 py-1 font-serif text-xs text-text-muted transition-colors hover:bg-bg-soft hover:text-[#9C4B3C]"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; calls: number; totalTokens: number }>;
}) {
  return (
    <div className="rounded-lg border border-text/[0.06] bg-surface px-4 py-3">
      <div className="mb-2 font-display text-sm font-semibold text-text">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="py-4 text-center font-serif text-xs text-text-muted">
          暂无数据
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between font-serif text-xs"
            >
              <span className="min-w-0 truncate text-text/80">{item.key}</span>
              <span className="ml-3 flex shrink-0 items-baseline gap-3 font-mono tabular-nums text-text-muted">
                <span>{item.calls} 次</span>
                <span className="text-text/70">
                  {formatNumber(item.totalTokens)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
