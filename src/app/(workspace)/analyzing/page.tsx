"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAnalysis } from "@/lib/report/session";
import { trackEvent } from "@/lib/report/analytics";
import {
  buildHistoryEntry,
  appendTeardownHistory,
} from "@/lib/report/teardown-history";
import type { AnalysisResult } from "@/lib/analysis/pipeline";

/**
 * 拆解进度展示页
 *
 * 两段分析并行执行：
 *  1. 正在拆解剧情（0-50%）
 *  2. 正在提取人设（50-100%）
 *
 * 实际调用 POST /api/teardown；进度条由定时器驱动，
 * 在 90% 处上限等待真实返回，返回后跳 /report。
 */

interface PendingInput {
  text: string;
  paragraphs: string[];
}

const STAGES = [
  { label: "正在拆解剧情", hint: "编辑视角速看 · 六核心要素 · 剧情情绪走向 · 创作资产化" },
  { label: "正在提取人设", hint: "人物清单与分级 · 人设机制表 · 人物小传 · 可复用人设卡" },
];

const TARGET_BEFORE_DONE = 90;

export default function AnalyzingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const pendingRaw = sessionStorage.getItem("inksight:pending");
    if (!pendingRaw) {
      router.replace("/upload");
      return;
    }

    let pending: PendingInput;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      router.replace("/upload");
      return;
    }

    const timer = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + 1, TARGET_BEFORE_DONE);
        const idx = next >= 50 ? 1 : 0;
        setStageIdx(idx);
        return next;
      });
    }, 2500);

    const controller = new AbortController();
    let navTimer: ReturnType<typeof setTimeout> | undefined;

    fetch("/api/teardown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: pending.text,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || data.detail || `HTTP ${res.status}`
          );
        }
        clearInterval(timer);
        setProgress(100);
        setStageIdx(1);
        setDone(true);

        const result = data as AnalysisResult;
        trackEvent("analysis_completed", {
          processing_time: result.meta?.totalMs ?? 0,
          degraded: result.meta?.degraded ?? false,
          plot_status: result.plot?.status ?? "error",
          character_status: result.character?.status ?? "error",
        });

        saveAnalysis(result, pending.paragraphs);

        const historyTitle = pending.text.slice(0, 20).trim() || "未命名作品";
        const plotType = result.plot.data?.editorView.basicInfo.type ?? "未知";
        appendTeardownHistory(
          buildHistoryEntry(result, historyTitle, plotType + "-" + Date.now())
        );
        sessionStorage.removeItem("inksight:pending");

        navTimer = setTimeout(() => router.replace("/report"), 600);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        clearInterval(timer);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        trackEvent("analysis_failed", { error: msg });
      });

    return () => {
      clearInterval(timer);
      controller.abort();
      if (navTimer) clearTimeout(navTimer);
      startedRef.current = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 py-10">
        <div className="w-full rounded-md border border-border bg-surface p-8 shadow-card md:p-10">
          <div className="mb-6 text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
              拆解进行中
            </div>
            <h1 className="mt-2 font-display text-3xl font-extrabold text-text">
              正在为你的小说拍 X 光片
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              约 2-5 分钟，提示词复杂请耐心等候
            </p>
          </div>

          {/* 进度条 */}
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-sm font-semibold text-primary">
                {STAGES[stageIdx].label}
              </span>
              <span className="text-xs tabular-nums text-text-muted">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-soft">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-text-muted">
              {STAGES[stageIdx].hint}
            </div>
          </div>

          {/* 阶段清单 */}
          <ol className="space-y-2">
            {STAGES.map((s, i) => {
              const state =
                i < stageIdx || done
                  ? "done"
                  : i === stageIdx
                  ? "active"
                  : "pending";
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    state === "pending" ? "text-text-muted" : "text-text"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                      state === "done"
                        ? "border-primary bg-primary text-text-inverse"
                        : state === "active"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-text-muted text-text-muted"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span
                    className={
                      state === "active"
                        ? "font-semibold"
                        : state === "done"
                        ? "line-through opacity-60"
                        : ""
                    }
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* 错误降级 */}
          {error && (
            <div className="mt-6 rounded-md border-l-4 border-primary bg-primary/5 p-4">
              <div className="font-display text-sm font-semibold text-primary">
                拆解未能完成
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text">
                {error.includes("超时") || error.includes("timeout")
                  ? "分析超时了，可能是文本较长或服务繁忙，请稍后重试。"
                  : error.includes("未配置") || error.includes("API_KEY")
                  ? "AI 分析服务暂时不可用，可先用演示数据体验完整功能。"
                  : "网络或服务出现异常，请稍后重试。"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => router.replace("/upload")}
                  className="rounded-full border border-primary bg-primary px-4 py-1.5 text-xs text-text-inverse transition-colors hover:opacity-90"
                >
                  返回重试
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem("inksight:pending");
                    router.replace("/report");
                  }}
                  className="rounded-md border border-border bg-bg px-4 py-1.5 text-xs text-text transition-colors hover:border-accent"
                >
                  用演示数据查看报告
                </button>
              </div>
            </div>
          )}

          {/* 完成态 */}
          {done && !error && (
            <div className="mt-6 text-center text-sm text-accent">
              ✓ 拆解完成，正在跳转报告…
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
