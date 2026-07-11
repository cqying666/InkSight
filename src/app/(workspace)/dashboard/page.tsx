"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { peekEvents } from "@/lib/report/analytics";
import {
  computeDashboardData,
  type DashboardData,
} from "@/lib/report/metrics";

type TimeRange = 7 | 30 | 0;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const events = peekEvents();
    const dashboardData = computeDashboardData(events, timeRange);
    setData(dashboardData);
  }, [mounted, timeRange]);

  if (!mounted || !data) {
    return (
      <main className="min-h-screen bg-bg px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-text-muted">加载中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-title-xl font-bold text-text">
              闭环监控仪表盘
            </h1>
            <p className="mt-1 text-xs text-text-muted">
              PRD §7.2 指标体系 · 数据来自本地行为埋点
            </p>
          </div>
          <Link
            href="/"
            className="text-xs text-text-muted underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          >
            ← 返回首页
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-2 text-xs">
          <span className="text-text-muted">时间范围：</span>
          {(
            [
              { v: 7, label: "近 7 天" },
              { v: 30, label: "近 30 天" },
              { v: 0, label: "全部" },
            ] as { v: TimeRange; label: string }[]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setTimeRange(opt.v)}
              className={`rounded-md border px-2 py-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
                timeRange === opt.v
                  ? "border-primary/[0.16] bg-primary/[0.08] text-primary"
                  : "border-accent/40 bg-bg text-text hover:border-primary hover:ring-1 hover:ring-primary/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-text-muted">
            {data.totalEvents} 条事件 · {data.activeSessions} 个会话
          </span>
        </div>

        {data.isEmpty && (
          <div className="rounded-lg border border-accent/40 bg-bg-alt p-12 text-center shadow-sm">
            <p className="font-serif text-lg text-text">暂无埋点数据</p>
            <p className="mt-2 text-xs text-text-muted">
              开始使用平台（上传拆文 / 创作 / 浏览趋势）后，这里会显示指标
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/upload"
                className="rounded-full border border-primary bg-primary px-4 py-2 text-xs text-inverse transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              >
                上传拆文
              </Link>
              <Link
                href="/write"
                className="rounded-lg border border-accent/40 bg-bg px-4 py-2 text-xs text-text transition-all hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              >
                开始创作
              </Link>
            </div>
          </div>
        )}

        {!data.isEmpty && (
          <div
            className={`mb-6 rounded-lg border p-6 shadow-md ${
              data.northStar.achieved
                ? "border-primary/[0.16] bg-primary/[0.05]"
                : "border-accent/40 bg-bg-alt"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-text-muted">
                  北极星指标
                </span>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-text">
                  {data.northStar.label}
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  {data.northStar.description}
                </p>
              </div>
              <div className="text-right">
                <div className="font-display text-4xl font-extrabold text-primary tabular-nums">
                  {data.northStar.value}
                  <span className="ml-1 text-sm font-normal text-text-muted">
                    {data.northStar.unit}
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  目标 ≥ {data.northStar.target} {data.northStar.unit}{" "}
                  {data.northStar.achieved ? "✅" : "⏳"}
                </div>
              </div>
            </div>
          </div>
        )}

        {!data.isEmpty && data.loopFunnel.length > 0 && (
          <div className="mb-6 rounded-lg border border-accent/40 bg-bg-alt p-5 shadow-sm">
            <h3 className="mb-4 font-serif text-lg font-semibold text-text">
              闭环漏斗
            </h3>
            <div className="space-y-2">
              {data.loopFunnel.map((stage, i) => {
                const maxCount = Math.max(
                  ...data.loopFunnel.map((s) => s.count),
                  1
                );
                const widthPct = (stage.count / maxCount) * 100;
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-text">
                      {stage.stage}
                    </span>
                    <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-bg-alt/50">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2 text-xs">
                        <span className="font-medium text-text tabular-nums">
                          {stage.count} 人
                        </span>
                        {i > 0 && (
                          <span className="text-text-muted tabular-nums">
                            转化 {stage.rate.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!data.isEmpty && (
          <div className="space-y-4">
            {data.modules.map((mod) => (
              <div
                key={mod.module}
                className="rounded-lg border border-accent/40 bg-bg-alt p-5 shadow-sm"
              >
                <h3 className="mb-3 font-serif text-lg font-semibold text-text">
                  {mod.module}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {mod.metrics.map((m) => (
                    <MetricCard
                      key={m.name}
                      label={m.label}
                      status={m.status}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  status,
}: {
  label: string;
  status: {
    value: number;
    target: number;
    unit: string;
    achieved: boolean;
    numerator: number;
    denominator: number;
  };
}) {
  const valueDisplay =
    status.unit === "%"
      ? `${status.value.toFixed(1)}%`
      : status.value.toFixed(status.value < 10 ? 1 : 0);

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md ${
        status.achieved
          ? "border-primary/[0.16] bg-primary/[0.05]"
          : "border-accent/30 bg-bg"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text">{label}</span>
        <span className="text-[10px] text-text-muted">
          {status.achieved ? "✅ 达标" : "⏳ 未达标"}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold text-text tabular-nums">
          {valueDisplay}
        </span>
        <span className="text-xs text-text-muted">
          / 目标 {status.target}
          {status.unit}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-text-muted tabular-nums">
        {status.numerator} / {status.denominator}
      </div>
    </div>
  );
}
