"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/analysis/pipeline";
import { MOCK_ANALYSIS } from "@/lib/report/mock-data";
import { trackEvent } from "@/lib/report/analytics";

/**
 * P3-T3 双篇对比（轻量版）
 *
 * 用户作品 vs 参考作品，关键维度差异可视化。
 *
 * 当前状态：对比功能升级中。
 * 原有的 19 维度数值对比基于旧版 FeedbackResult 结构（teardown/type/diagnosis），
 * 已被新的 AnalysisResult（拆文 + 人设）结构取代，维度不再对应。
 * 在重新设计对比维度前，先以占位卡片承接，保留页面骨架与埋点。
 */

const DEMO_TITLE =
  MOCK_ANALYSIS.plot.data?.editorView.basicInfo.title ?? "演示样例";

export default function ComparePage() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; isMock: boolean }
  >({ status: "loading" });

  useEffect(() => {
    // 用户作品：从 sessionStorage 读（新分析结构）
    let hasUserAnalysis = false;
    try {
      const raw = sessionStorage.getItem("inksight:analysis");
      if (raw) {
        const parsed = JSON.parse(raw) as AnalysisResult;
        if (
          parsed.plot.status === "loaded" ||
          parsed.character.status === "loaded"
        ) {
          hasUserAnalysis = true;
        }
      }
    } catch {
      // ignore
    }

    if (hasUserAnalysis) {
      setState({ status: "ready", isMock: false });
      trackEvent("report_viewed", { is_mock: false, page: "compare" });
    } else {
      // 无用户作品：用 mock 演示
      setState({ status: "ready", isMock: true });
      trackEvent("report_demo_viewed", { page: "compare" });
    }
  }, []);

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-sm text-text-muted">加载对比…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
        <header className="mb-8 border-b border-border pb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
            <span className="text-primary">双篇对比</span> · 学
          </div>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-text">
            作品 vs 参考
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            把你的拆解结果与参考作品并排比较，找差距与可借鉴之处。
          </p>
        </header>

        {state.isMock && (
          <div className="mb-6 rounded-sm border border-border bg-surface px-4 py-2.5 text-xs text-text-muted">
            <span className="text-accent">演示模式</span> · 当前以样例《
            {DEMO_TITLE}》承接，对比内容暂不可用。
            <Link
              href="/upload"
              className="ml-2 text-primary underline hover:text-primary"
            >
              上传你的小说获得真实对比 →
            </Link>
          </div>
        )}

        {/* 对比功能升级中占位 */}
        <section className="rounded-sm border border-border bg-surface p-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.06] text-accent">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v16M4 4h16M8 8h8M8 12h5M8 16h3"
              />
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-semibold text-text">
            对比功能升级中
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-muted">
            双篇对比正在升级，以适配新的「拆文 + 人设」分析结构。
            原有的 19 维度数值对比基于旧版反馈模型，已不再适用，
            新的对比维度正在设计中，请期待后续版本。
          </p>
        </section>

        <footer className="mt-12 flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <span>InkSight · 双篇对比（轻量版）</span>
          <div className="flex flex-wrap gap-3">
            <Link href="/write" className="text-primary underline hover:text-primary">
              去创作
            </Link>
            <Link href="/trend" className="text-primary underline hover:text-primary">
              趋势雷达
            </Link>
            <Link href="/material" className="text-primary underline hover:text-primary">
              素材库
            </Link>
            <Link href="/report" className="hover:text-text">
              返回报告
            </Link>
            <Link href="/" className="hover:text-text">
              返回首页
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
