"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/report/analytics";
import type {
  GuideAnalysisResult,
  GuideAnalysisWithDirectionsResult,
} from "@/lib/analysis/guide-pipeline";

/**
 * 导语专项拆解页
 *
 * 从 sessionStorage 读取导语文本，调用 /api/guide-analysis，
 * 完成后展示：导语分析 / 逐句拆解。
 */

interface PendingGuide {
  text: string;
  mode?: "analysis" | "analysis_with_directions";
}

function hasDerivativeDirections(
  value: GuideAnalysisResult
): value is GuideAnalysisWithDirectionsResult {
  return "derivativeDirections" in value;
}

const MAX_RETRIES = 3;
const TARGET_BEFORE_DONE = 90;

export default function GuideAnalyzingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{
    current: number;
    max: number;
  } | null>(null);
  const [result, setResult] = useState<GuideAnalysisResult | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const runAnalysis = () => {
    const pendingRaw = sessionStorage.getItem("inksight:guide-pending");
    if (!pendingRaw) {
      router.replace("/");
      return;
    }

    let pending: PendingGuide;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      router.replace("/");
      return;
    }

    setProgress(0);
    setError(null);
    setDone(false);
    setRetrying(false);
    setRetryInfo(null);
    setResult(null);

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    let cancelled = false;
    let retriesLeft = MAX_RETRIES;
    let timer: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;

    const attemptFetch = () => {
      controller = new AbortController();
      timer = setInterval(() => {
        setProgress((p) => Math.min(p + 2, TARGET_BEFORE_DONE));
      }, 1500);

      fetch("/api/guide-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pending.text,
          mode: pending.mode ?? "analysis",
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
          setRetryInfo(null);

          setResult(data.data);
          setDurationMs(data.meta?.durationMs ?? 0);
          setDone(true);
          setRetrying(false);
          trackEvent("guide_analysis_completed", {
            duration_ms: data.meta?.durationMs ?? 0,
            tokens: data.meta?.tokens ?? 0,
          });
          // 分析完成即清理 sessionStorage（导语拆解不沉淀到素材库）
          sessionStorage.removeItem("inksight:guide-pending");
        })
        .catch((err) => {
          if (cancelled) return;
          clearInterval(timer);

          if (err.name === "AbortError") return;

          retriesLeft -= 1;
          if (retriesLeft <= 0) {
            setError(
              err instanceof Error ? err.message : "导语分析失败，请重试"
            );
            setRetrying(false);
            setRetryInfo(null);
            trackEvent("guide_analysis_failed", {
              reason: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          setRetrying(true);
          setRetryInfo({ current: MAX_RETRIES - retriesLeft + 1, max: MAX_RETRIES });
          retryTimer = setTimeout(attemptFetch, 1500);
        });
    };

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    attemptFetch();

    cleanupRef.current = () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (controller) controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  };

  useEffect(() => {
    runAnalysis();
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    runAnalysis();
  };

  // ===== 渲染：错误态 =====
  if (error && !done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-10">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9C4B3C]/10">
              <span className="text-xl text-[#9C4B3C]">!</span>
            </div>
          </div>
          <h1 className="mb-2 font-serif text-lg font-semibold text-text">
            导语分析失败
          </h1>
          <p className="mb-6 font-serif text-sm text-text-muted">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-md bg-primary px-4 py-2 font-serif text-sm text-text-inverse transition-colors hover:bg-primary/90"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-md border border-text/[0.10] bg-surface px-4 py-2 font-serif text-sm text-text-muted transition-colors hover:text-text"
            >
              返回首页
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ===== 渲染：进度态 =====
  if (!done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="mb-1 font-serif text-lg font-semibold text-text">
              {retrying ? "正在重试…" : "正在拆解导语"}
            </h1>
            <p className="font-serif text-xs text-text-muted">
              {retryInfo
                ? `第 ${retryInfo.current} / ${retryInfo.max} 次重试`
                : "钩子 · 痛点 · 爽点 · 逐句功能"}
            </p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-text/[0.06]">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right font-mono text-[10px] text-text-muted/60">
            {progress}%
          </div>
        </div>
      </main>
    );
  }

  // ===== 渲染：完成态 =====
  if (!result) return null;

  const { guideAnalysis, sentenceAnalysis, guideReview } = result;
  const directionResult = hasDerivativeDirections(result) ? result : null;

  return (
    <main className="min-h-screen bg-bg px-6 py-10 md:px-10">
      <div className="mx-auto max-w-3xl">
        {/* 头部 */}
        <header className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-accent/[0.12] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
              导语拆解
            </span>
            <span className="font-mono text-[10px] text-text-muted/60">
              耗时 {(durationMs / 1000).toFixed(1)}s
            </span>
          </div>
          <h1 className="font-serif text-title-lg font-medium text-text">
            导语分析报告
          </h1>
        </header>

        {/* 一、导语分析 */}
        <section className="mb-8 rounded-xl border border-text/[0.06] bg-surface p-6">
          <h2 className="mb-4 font-serif text-base font-semibold text-text">
            一、导语分析
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="主角身份">
              {guideAnalysis.protagonistIdentity}
            </Field>
            <Field label="反派 / 冲突方">
              {guideAnalysis.antagonist}
            </Field>
            <Field label="第一矛盾冲突">
              {guideAnalysis.firstConflict}
            </Field>
            <Field label="痛点承诺">
              {guideAnalysis.painPoint}
            </Field>
            <Field label="爽点承诺">
              {guideAnalysis.satisfactionPoint}
            </Field>
            <Field label="导语模型抽象" fullWidth>
              {guideReview.guideModel}
            </Field>
          </div>
          {guideAnalysis.highlights.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                核心亮点
              </div>
              <ul className="space-y-1">
                {guideAnalysis.highlights.map((h, i) => (
                  <li
                    key={i}
                    className="flex gap-2 font-serif text-sm text-text"
                  >
                    <span className="text-accent">·</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 二、逐句拆解 */}
        <section className="mb-8 rounded-xl border border-text/[0.06] bg-surface p-6">
          <h2 className="mb-4 font-serif text-base font-semibold text-text">
            二、逐句功能拆解
          </h2>
          {sentenceAnalysis.length === 0 ? (
            <p className="font-serif text-sm text-text-muted">
              未识别到可拆解句子
            </p>
          ) : (
            <ol className="space-y-3">
              {sentenceAnalysis.map((s, i) => (
                <li
                  key={i}
                  className="border-l-2 border-accent/30 pl-3"
                >
                  <p className="font-serif text-sm italic text-text">
                    「{s.sentence}」
                  </p>
                  <p className="mt-1 font-serif text-xs text-text-muted">
                    {s.function}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 三、核心元素（仅二创模式） */}
        {directionResult && (
          <section className="mb-8 rounded-xl border border-text/[0.06] bg-surface p-6">
            <h2 className="mb-1 font-serif text-base font-semibold text-text">
              三、可迁移核心元素
            </h2>
            <p className="mb-4 font-serif text-xs text-text-muted">
              提取能跨人物、关系与题材复用的结构机制，而不是照搬原导语细节。
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="钩子机制">
                {directionResult.coreElements.hookMechanism}
              </Field>
              <Field label="主角设置">
                {directionResult.coreElements.protagonistSetup}
              </Field>
              <Field label="冲突发动机">
                {directionResult.coreElements.conflictEngine}
              </Field>
              <Field label="信息差">
                {directionResult.coreElements.informationGap}
              </Field>
              <Field label="痛点承诺">
                {directionResult.coreElements.painPromise}
              </Field>
              <Field label="爽点承诺">
                {directionResult.coreElements.satisfactionPromise}
              </Field>
              <Field label="情绪反差" fullWidth>
                {directionResult.coreElements.emotionalContrast}
              </Field>
            </div>
            <div className="mt-5">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                句序骨架
              </div>
              <ol className="space-y-2">
                {directionResult.coreElements.sentenceStructure.map((step, i) => (
                  <li key={i} className="flex gap-3 font-serif text-sm text-text">
                    <span className="font-mono text-xs text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* 四、二创方向（仅二创模式） */}
        {directionResult && (
          <section className="mb-8 rounded-xl border border-text/[0.06] bg-surface p-6">
            <h2 className="mb-1 font-serif text-base font-semibold text-text">
              四、二创方向
            </h2>
            <p className="mb-5 font-serif text-xs text-text-muted">
              每个方向只迁移结构机制，并明确替换项、差异与避雷。
            </p>
            <div className="space-y-4">
              {directionResult.derivativeDirections.map((direction, i) => {
                const recommended =
                  directionResult.recommendedDirection.includes(direction.title) ||
                  direction.title.includes(directionResult.recommendedDirection);
                return (
                  <article
                    key={`${direction.title}-${i}`}
                    className={`rounded-lg border p-5 ${
                      recommended
                        ? "border-accent/30 bg-accent/[0.04]"
                        : "border-text/[0.06] bg-bg/40"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                          方向 {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="mt-1 font-serif text-base font-semibold text-text">
                          {direction.title}
                        </h3>
                      </div>
                      {recommended && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent">
                          推荐
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      <Field label="新核心梗">
                        {direction.newCorePremise}
                      </Field>
                      <Field label="迁移机制">
                        {direction.transferableMechanism}
                      </Field>
                      <div>
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                          元素替换
                        </div>
                        <ul className="space-y-1">
                          {direction.replaceableElements.map((item, itemIndex) => (
                            <li
                              key={itemIndex}
                              className="flex gap-2 font-serif text-sm text-text"
                            >
                              <span className="text-accent">·</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Field label="起手蓝图">
                        {direction.openingBlueprint}
                      </Field>
                      <Field label="实质差异">
                        {direction.differentiation}
                      </Field>
                      <div className="rounded-md bg-danger/[0.06] px-3 py-2">
                        <Field label="风险 / 避雷">{direction.risk}</Field>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-5 rounded-lg border-l-4 border-accent bg-bg/60 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                推荐方向
              </div>
              <p className="mt-1 font-serif text-sm font-semibold text-text">
                {directionResult.recommendedDirection}
              </p>
              <p className="mt-1 font-serif text-xs leading-relaxed text-text-muted">
                {directionResult.recommendationReason}
              </p>
            </div>
          </section>
        )}

        {/* 底部操作 */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-md border border-text/[0.10] bg-surface px-4 py-2 font-serif text-sm text-text-muted transition-colors hover:text-text"
          >
            返回首页
          </button>
        </div>
      </div>
    </main>
  );
}

/** 单字段展示 */
function Field({
  label,
  children,
  fullWidth,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
        {label}
      </div>
      <div className="font-serif text-sm text-text">{children}</div>
    </div>
  );
}
