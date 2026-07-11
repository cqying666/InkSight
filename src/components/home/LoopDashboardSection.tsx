"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { peekEvents } from "@/lib/report/analytics";
import { computeDashboardData, type DashboardData } from "@/lib/report/metrics";

type TimeRange = 7 | 30 | 0;

export function LoopDashboardSection() {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    setData(computeDashboardData(peekEvents(), timeRange));
  }, [timeRange]);

  if (!data) {
    return (
      <section id="loop-dashboard" className="mb-12 rounded-3xl border border-text/[0.05] bg-surface p-6 shadow-card">
        <p className="text-sm text-text-muted">正在读取你的创作闭环…</p>
      </section>
    );
  }

  return (
    <section id="loop-dashboard" className="mb-12 scroll-mt-6 rounded-3xl border border-text/[0.05] bg-surface p-6 shadow-card md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Creative loop</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-text">我的创作闭环</h2>
          <p className="mt-1 text-xs text-text-muted">拆文、沉淀素材、进入创作，再回来看自己的进步。</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-bg p-1">
          {([
            { value: 7, label: "近 7 天" },
            { value: 30, label: "近 30 天" },
            { value: 0, label: "全部" },
          ] as Array<{ value: TimeRange; label: string }>).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTimeRange(item.value)}
              className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                timeRange === item.value
                  ? "bg-primary text-text-inverse"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {data.isEmpty ? (
        <div className="mt-6 rounded-2xl bg-bg px-6 py-8 text-center">
          <p className="font-serif text-lg text-text">你的闭环会从第一次行动开始</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-text-muted">
            上传一篇小说完成拆文，选择有价值的素材入库，再进入工作台创作，首页会自动记录进度。
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/upload" className="rounded-full bg-primary px-4 py-2 text-xs text-text-inverse">
              开始拆文
            </Link>
            <Link href="/write" className="rounded-full border border-text/[0.10] px-4 py-2 text-xs text-text">
              直接创作
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-[1.1fr_1.9fr]">
            <div className={`rounded-2xl border p-5 ${data.northStar.achieved ? "border-accent/25 bg-accent/[0.05]" : "border-text/[0.06] bg-bg"}`}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">北极星指标</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="font-serif text-base font-semibold text-text">{data.northStar.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{data.northStar.description}</p>
                </div>
                <div className="text-right">
                  <span className="font-display text-4xl font-bold tabular-nums text-primary">{data.northStar.value}</span>
                  <span className="ml-1 text-xs text-text-muted">{data.northStar.unit}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-text/[0.06] bg-bg p-5">
              <div className="flex items-center justify-between">
                <p className="font-serif text-base font-semibold text-text">闭环进度</p>
                <span className="text-[10px] text-text-muted">{data.totalEvents} 条行为记录</span>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {data.loopFunnel.map((stage, index) => (
                  <div key={stage.stage} className="min-w-0">
                    <div className={`h-1.5 rounded-full ${stage.count > 0 ? "bg-primary" : "bg-text/[0.08]"}`} />
                    <p className="mt-2 truncate text-[10px] text-text-muted">{stage.stage}</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-text">{stage.count} 次</p>
                    {index > 0 && <p className="text-[9px] text-text-muted">转化 {stage.rate.toFixed(0)}％</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.modules.map((module) => {
              const metric = module.metrics[0];
              const value = metric.status.unit === "%"
                ? `${metric.status.value.toFixed(0)}％`
                : `${metric.status.value.toFixed(metric.status.value < 10 ? 1 : 0)}${metric.status.unit}`;
              return (
                <div key={module.module} className="rounded-xl border border-text/[0.05] bg-bg px-4 py-3">
                  <p className="text-[10px] text-text-muted">{module.module}</p>
                  <p className="mt-1 font-display text-xl font-semibold text-text">{value}</p>
                  <p className="mt-0.5 truncate text-[10px] text-text-muted">{metric.label}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
