"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAnalysis } from "@/lib/report/session";
import { trackEvent } from "@/lib/report/analytics";
import {
  buildHistoryEntry,
  appendTeardownHistory,
} from "@/lib/report/teardown-history";
import {
  buildAnalysisMaterialCandidates,
  upsertMaterial,
} from "@/lib/material";
import type { AnalysisResult } from "@/lib/analysis/pipeline";
import type { ExampleWork } from "@/lib/example";
import {
  createExample,
  enrichExampleWithAnalysis,
  getExample,
  upsertExample,
} from "@/lib/example";

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
  fileName?: string;
  exampleId?: string;
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
  const [retrying, setRetrying] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{
    current: number;
    max: number;
  } | null>(null);
  const [exampleSaveFailed, setExampleSaveFailed] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<PendingInput | null>(null);
  const pendingExampleSaveRef = useRef<ExampleWork | null>(null);

  const runAnalysis = () => {
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
    pendingRef.current = pending;

    setProgress(0);
    setStageIdx(0);
    setError(null);
    setDone(false);
    setRetrying(false);
    setRetryInfo(null);
    setExampleSaveFailed(false);
    pendingExampleSaveRef.current = null;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const MAX_RETRIES = 3;
    let cancelled = false;
    let retriesLeft = MAX_RETRIES;
    let timer: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;
    let navTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const attemptFetch = () => {
      controller = new AbortController();
      timer = setInterval(() => {
        setProgress((p) => {
          const next = Math.min(p + 1, TARGET_BEFORE_DONE);
          const idx = next >= 50 ? 1 : 0;
          setStageIdx(idx);
          return next;
        });
      }, 2500);

      fetch("/api/teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pending.text,
          ...(pending.fileName ? { fileName: pending.fileName } : {}),
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
          if (cancelled) return;
          clearInterval(timer);
          setProgress(100);
          setStageIdx(1);
          setRetryInfo(null);

          const result = data as AnalysisResult;
          trackEvent("analysis_completed", {
            processing_time: result.meta?.totalMs ?? 0,
            degraded: result.meta?.degraded ?? false,
            plot_status: result.plot?.status ?? "error",
            character_status: result.character?.status ?? "error",
          });

          const historyTitle =
            pending.fileName && pending.fileName.trim() !== "粘贴文本"
              ? pending.fileName.trim().replace(/\.[^.]+$/, "")
              : pending.text.slice(0, 20).trim() || "未命名作品";
          const plotType = result.plot.data?.editorView.basicInfo.type ?? "未知";
          const reportId = `${plotType}-${Date.now()}`;
          saveAnalysis(result, pending.paragraphs, reportId);
          await appendTeardownHistory(
            buildHistoryEntry(result, historyTitle, reportId)
          );

          let exampleToSave: ExampleWork | null = null;
          try {
            const existing = pending.exampleId
              ? await getExample(pending.exampleId)
              : null;
            const example =
              existing ??
              createExample({
                id: pending.exampleId,
                title: historyTitle,
                text: pending.text,
              });
            exampleToSave = enrichExampleWithAnalysis(example, result, reportId);
            const saved = await upsertExample(exampleToSave);
            if (!saved) throw new Error("例文报告保存失败");
          } catch (caught) {
            trackEvent("example_save_failed", {
              report_id: reportId,
              error: caught instanceof Error ? caught.message : String(caught),
            });
            if (exampleToSave) {
              pendingExampleSaveRef.current = exampleToSave;
              setExampleSaveFailed(true);
              setError("拆文已完成，但例文报告保存失败");
              return;
            }
          }

          // 拆文素材自动入库：提取 6 张素材卡 + 人设卡 + 关系卡，持久化到 SQLite
          // source = "teardown" 会被「全部素材」和「拆文汇总」同时命中
          try {
            const candidates = buildAnalysisMaterialCandidates(result, reportId);
            const results = await Promise.all(
              candidates.map((c) => upsertMaterial(c.material))
            );
            const persistedCount = results.filter(Boolean).length;
            trackEvent("material_auto_extracted", {
              report_id: reportId,
              extract_count: candidates.length,
              persisted_count: persistedCount,
              source: "teardown",
            });
          } catch (e) {
            // 素材入库失败不影响主流程，静默降级
            trackEvent("material_extract_failed", {
              report_id: reportId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          setDone(true);
          sessionStorage.removeItem("inksight:pending");

          navTimer = setTimeout(() => router.replace("/report"), 600);
        })
        .catch((e) => {
          if (controller?.signal.aborted || cancelled) return;
          if (timer) clearInterval(timer);
          const msg = e instanceof Error ? e.message : String(e);

          // 可重试的错误：超时、网络异常
          const isRetryable =
            msg.includes("超时") ||
            msg.includes("timeout") ||
            msg.includes("网络") ||
            msg.includes("network") ||
            msg.includes("fetch") ||
            msg.includes("Failed to");

          if (isRetryable && retriesLeft > 0) {
            retriesLeft--;
            const attempt = MAX_RETRIES - retriesLeft;
            setRetryInfo({ current: attempt, max: MAX_RETRIES });
            setProgress(0);
            setStageIdx(0);
            trackEvent("analysis_auto_retry", {
              retry_attempt: attempt,
              error: msg,
            });
            retryTimer = setTimeout(() => {
              if (!cancelled) attemptFetch();
            }, 1500);
          } else {
            setError(msg);
            setRetryInfo(null);
            trackEvent("analysis_failed", {
              error: msg,
              retries_used: MAX_RETRIES - retriesLeft,
            });
          }
        });
    };

    attemptFetch();

    cleanupRef.current = () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      controller?.abort();
      if (navTimer) clearTimeout(navTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  };

  const handleRetry = () => {
    setRetrying(true);
    trackEvent("analysis_retry", {});
    runAnalysis();
  };

  const retryExampleSave = async () => {
    const example = pendingExampleSaveRef.current;
    if (!example) return;
    setRetrying(true);
    const saved = await upsertExample(example);
    setRetrying(false);
    if (!saved) {
      setError("拆文已完成，但例文报告保存失败");
      return;
    }
    setExampleSaveFailed(false);
    setError(null);
    setDone(true);
    sessionStorage.removeItem("inksight:pending");
    window.setTimeout(() => router.replace("/report"), 300);
  };

  useEffect(() => {
    runAnalysis();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          {/* 自动重试提示 */}
          {retryInfo && !error && (
            <div className="mb-4 rounded-md border border-accent/30 bg-accent/[0.06] px-4 py-2 text-center text-xs text-accent">
              上次尝试超时，正在自动重试（第 {retryInfo.current}/{retryInfo.max} 次）…
            </div>
          )}

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
                {exampleSaveFailed ? "拆文完成，报告暂未入库" : "拆解未能完成"}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text">
                {exampleSaveFailed
                  ? "分析结果已经保留，不会重新调用 AI。请重试保存，成功后即可查看报告。"
                  : error.includes("超时") || error.includes("timeout")
                  ? `已自动重试 3 次仍超时，可能是文本较长或服务繁忙，请稍后手动重试。`
                  : error.includes("未配置") || error.includes("API_KEY")
                  ? "AI 分析服务暂时不可用，可先用演示数据体验完整功能。"
                  : "已自动重试 3 次仍失败，网络或服务出现异常，请稍后手动重试。"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={exampleSaveFailed ? () => void retryExampleSave() : handleRetry}
                  disabled={retrying}
                  className="rounded-full border border-primary bg-primary px-4 py-1.5 text-xs text-text-inverse transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {exampleSaveFailed
                    ? retrying ? "保存中…" : "重试保存并查看报告"
                    : retrying ? "重新拆解中…" : "重新拆解"}
                </button>
                {!exampleSaveFailed && <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem("inksight:pending");
                    router.replace("/report");
                  }}
                  className="rounded-md border border-border bg-bg px-4 py-1.5 text-xs text-text transition-colors hover:border-accent"
                >
                  用演示数据查看报告
                </button>}
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
