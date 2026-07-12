"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MOCK_ANALYSIS, MOCK_PARAGRAPHS } from "@/lib/report/mock-data";
import { loadAnalysis, clearAnalysis } from "@/lib/report/session";
import { trackEvent } from "@/lib/report/analytics";
import type { AnalysisResult } from "@/lib/analysis/pipeline";
import { MaterialDepositPanel } from "@/components/report/MaterialDepositPanel";
import { getExample } from "@/lib/example";

const XrayReport = dynamic(
  () => import("@/components/report/XrayReport").then((m) => m.XrayReport),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-text-muted">
        正在生成 X 光片报告…
      </div>
    ),
  }
);

/**
 * X 光片报告页
 *
 * 数据源优先级：
 *  1. sessionStorage 中的真实分析结果（来自 /analyzing）
 *  2. 回退到 mock 数据（演示用）
 */

type State =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      analysis: AnalysisResult;
      paragraphs: string[];
      reportId: string;
      isMock: boolean;
      initialTab: "plot" | "character" | "original";
    };

export default function ReportPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [exported, setExported] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const search = new URLSearchParams(window.location.search);
      const exampleId = search.get("exampleId");
      const requestedTab = search.get("tab") === "original" ? "original" : "plot";

      if (exampleId) {
        const example = await getExample(exampleId);
        if (cancelled) return;
        if (!example?.analysis || example.status !== "analyzed" || !example.reportId) {
          setState({ status: "missing" });
          return;
        }
        setState({
          status: "ready",
          analysis: example.analysis,
          paragraphs: example.paragraphs,
          reportId: example.reportId,
          isMock: false,
          initialTab: requestedTab,
        });
        trackEvent("report_viewed", { is_mock: false, source: "example_library" });
        return;
      }

      const stored = loadAnalysis();
      if (stored) {
        setState({
          status: "ready",
          analysis: stored.analysis,
          paragraphs: stored.paragraphs,
          reportId: stored.reportId,
          isMock: false,
          initialTab: requestedTab,
        });
        trackEvent("report_viewed", { is_mock: false });
      } else {
        setState({
          status: "ready",
          analysis: MOCK_ANALYSIS,
          paragraphs: MOCK_PARAGRAPHS,
          reportId: "mock-report",
          isMock: true,
          initialTab: "plot",
        });
        trackEvent("report_demo_viewed", {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-sm text-text-muted">加载报告…</div>
      </main>
    );
  }

  if (state.status === "missing") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-5 text-center">
        <h1 className="font-serif text-2xl font-semibold text-text">这篇例文还没有可用的拆文报告</h1>
        <Link href="/material" className="text-sm text-accent underline underline-offset-2">返回例文库</Link>
      </main>
    );
  }

  const handleExport = () => {
    const { analysis, paragraphs: paras } = state;
    const lines: string[] = [];
    lines.push(`# 小说 X 光片报告`);
    lines.push("");

    // 拆文分析
    if (analysis.plot.status === "loaded" && analysis.plot.data) {
      const plot = analysis.plot.data;
      const bi = plot.editorView.basicInfo;
      lines.push(`## 基本信息`);
      lines.push(`- 标题：${bi.title}`);
      lines.push(`- 类型：${bi.type}`);
      lines.push(`- 字数：${bi.wordCount}`);
      lines.push(`- 一句话总结：${bi.oneLineSummary}`);
      lines.push("");

      lines.push(`## 一、编辑视角速看`);
      lines.push(`- 读者吸引力：${bi.readerAttraction}`);
      lines.push(`- 值得拆解理由：${bi.worthTeardownReason}`);
      lines.push(`- 导语模式：${plot.editorView.guideReview.guideModel}`);
      lines.push(`- 深拆判断：${plot.editorView.deepTeardownJudgment.conclusion}`);
      lines.push("");

      lines.push(`## 二、六核心要素`);
      lines.push(`- 核心吸引力：${plot.sixCoreElements.framework.coreAttractionType}`);
      lines.push(`- 痛点：${plot.sixCoreElements.painPoint.realPain}`);
      lines.push(`- 爽点：${plot.sixCoreElements.satisfactionPoint.type}`);
      lines.push(`- 信息差：${plot.sixCoreElements.infoGap.whoKnows} / ${plot.sixCoreElements.infoGap.whoDoesntKnow}`);
      lines.push("");

      lines.push(`## 三、剧情及情绪走向`);
      lines.push(`- 付费点位置：${plot.plotEmotionFlow.payPointPosition}`);
      lines.push(`- 卡点类型：${plot.plotEmotionFlow.cardType}`);
      lines.push(`- 情绪推进：${plot.plotEmotionFlow.emotionProgressionChain.initialEmotion} → ${plot.plotEmotionFlow.emotionProgressionChain.maxPressure}`);
      lines.push("");

      lines.push(`## 四、创作资产化`);
      lines.push(`- 核心梗：${plot.creativeAssets.coreGerm.abstractCoreGerm}`);
      lines.push(`- 卖点：${plot.creativeAssets.coreGerm.whatItSells}`);
      lines.push(`- 冲突发动机：${plot.creativeAssets.conflictEngine.sustainedBy}`);
      lines.push("");

      lines.push(`## 五、一主表`);
      const mt = plot.masterTable;
      lines.push(`- 题材：${mt.genre}`);
      lines.push(`- 核心吸引力：${mt.coreAttraction}`);
      lines.push(`- 付费卡点：${mt.payCardPoint}`);
      lines.push(`- 主要公式：${mt.mainFormula}`);
      lines.push("");

      if (plot.newStoryDirections.length > 0) {
        lines.push(`## 六、新故事方向`);
        plot.newStoryDirections.forEach((d, i) => {
          lines.push(`### 方向 ${i + 1}：${d.newCoreGerm}`);
          lines.push(`- 适合类型：${d.suitableType}`);
          lines.push(`- 差异：${d.difference}`);
        });
        lines.push(`- 推荐方向：${plot.recommendedDirection}`);
        lines.push("");
      }
    }

    // 人设分析
    if (analysis.character.status === "loaded" && analysis.character.data) {
      const char = analysis.character.data;
      lines.push(`## 人设分析`);
      lines.push(`- 核心人物吸引力：${char.characterList.coreCharacterAttraction}`);
      lines.push("");

      lines.push(`### 人物清单`);
      char.characterList.characters.forEach((c) => {
        lines.push(`- ${c.name}（${c.tier}）：${c.storyFunction}`);
      });
      lines.push("");

      if (char.biographies.length > 0) {
        lines.push(`### 人物小传`);
        char.biographies.forEach((b) => {
          lines.push(`#### ${b.name}（${b.role}）`);
          lines.push(b.biography);
          lines.push("");
        });
      }
    }

    lines.push(`## 原文`);
    paras.forEach((p, i) => lines.push(`${String(i + 1).padStart(2, "0")}. ${p}`));

    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inksight-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    trackEvent("report_exported", {
      format: "markdown",
      plot_status: analysis.plot.status,
      character_status: analysis.character.status,
    });
    setTimeout(() => setExported(false), 2500);
  };

  const handleExportPDF = () => {
    trackEvent("report_exported", {
      format: "pdf",
      plot_status: state.analysis.plot.status,
      character_status: state.analysis.character.status,
    });
    setPdfExported(true);
    setTimeout(() => setPdfExported(false), 2500);
    setTimeout(() => window.print(), 100);
  };

  const handleTeardownAnother = () => {
    clearAnalysis();
    window.location.href = "/upload";
  };

  return (
    <main className="min-h-screen bg-bg">
      <div className="report-print-area mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
        {state.isMock && (
          <div className="no-print mb-6 rounded-md border border-accent bg-surface px-4 py-2.5 text-xs text-text-muted">
            <span className="text-accent">演示模式</span> · 当前展示样例数据。
            <Link
              href="/upload"
              className="ml-2 text-primary underline hover:text-primary"
            >
              上传你的小说 →
            </Link>
          </div>
        )}

        <XrayReport
          analysis={state.analysis}
          paragraphs={state.paragraphs}
          initialTab={state.initialTab}
        />

        <MaterialDepositPanel
          analysis={state.analysis}
          reportId={state.reportId}
          disabled={state.isMock}
        />

        {/* 下一步行动引导 */}
        <section className="no-print mt-10" aria-label="下一步行动">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="font-display text-xl font-bold text-text">下一步行动</h2>
            <p className="mt-1 text-xs text-text-muted">基于这份拆解，继续精进你的创作</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleTeardownAnother}
                className="rounded-md border border-border bg-bg p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="font-display text-sm font-semibold text-text">拆解下一篇</div>
                <p className="mt-1 text-xs text-text-muted">多拆几篇找感觉，眼力是练出来的</p>
                <span className="mt-2 block text-xs text-primary">→</span>
              </button>
              <Link
                href="/write"
                className="rounded-md border border-border bg-bg p-4 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="font-display text-sm font-semibold text-text">开始创作</div>
                <p className="mt-1 text-xs text-text-muted">带着这份拆解，动手写一篇</p>
                <span className="mt-2 block text-xs text-primary">→</span>
              </Link>
              <Link
                href="/compare"
                className="rounded-md border border-border bg-bg p-4 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="font-display text-sm font-semibold text-text">双篇对比</div>
                <p className="mt-1 text-xs text-text-muted">对比两份拆解找差异</p>
                <span className="mt-2 block text-xs text-primary">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* 导出 */}
        <section className="no-print mt-6 rounded-md border border-border bg-surface p-5">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              className="rounded-full border border-primary bg-primary px-5 py-2 font-display text-sm text-text-inverse transition-colors hover:opacity-90"
            >
              {pdfExported ? "✓ 正在生成…" : "导出 PDF"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-md border border-border bg-bg px-5 py-2 font-display text-sm text-text transition-colors hover:border-primary hover:text-primary"
            >
              {exported ? "✓ 已导出" : "导出 Markdown"}
            </button>
          </div>
        </section>

        <footer className="no-print mt-12 flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <span>
            {state.isMock ? "InkSight · 演示数据" : "InkSight · 真实拆解结果"}
          </span>
          <div className="flex gap-3">
            {!state.isMock && (
              <button
                type="button"
                onClick={handleTeardownAnother}
                className="text-primary underline hover:text-primary"
              >
                拆解下一篇
              </button>
            )}
            <Link href="/" className="hover:text-text">
              返回首页
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
