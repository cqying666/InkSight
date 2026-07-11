"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/analysis/pipeline";
import { PlotReport } from "./PlotReport";
import { CharacterReport } from "./CharacterReport";

/**
 * 小说 X 光片报告
 *
 * 两个分析维度 + 原文浏览：
 *  - 拆文分析（剧情拆解 7 部分）
 *  - 人设分析（人设提取 7 部分）
 *  - 原文
 *
 * 降级：单个分析失败时显示错误提示，另一个仍可用。
 */

type Tab = "plot" | "character" | "original";

interface Props {
  analysis: AnalysisResult;
  paragraphs: string[];
}

export function XrayReport({ analysis, paragraphs }: Props) {
  const [tab, setTab] = useState<Tab>("plot");

  const plotLoaded = analysis.plot.status === "loaded";
  const characterLoaded = analysis.character.status === "loaded";
  const plotData = plotLoaded ? analysis.plot.data : null;
  const characterData = characterLoaded ? analysis.character.data : null;

  // 基本信息从拆文分析提取
  const basicInfo = plotData?.editorView.basicInfo;
  const title = basicInfo?.title ?? "未命名作品";
  const genre = basicInfo?.type ?? "";
  const wordCount = basicInfo?.wordCount ?? "";
  const oneLineSummary = basicInfo?.oneLineSummary ?? "";

  const tabs: { id: Tab; label: string; available: boolean }[] = [
    { id: "plot", label: "拆文分析", available: plotLoaded },
    { id: "character", label: "人设分析", available: characterLoaded },
    { id: "original", label: "原文", available: paragraphs.length > 0 },
  ];

  return (
    <div className="space-y-8">
      {/* 报告抬头 */}
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-baseline gap-3 text-xs uppercase tracking-[0.2em] text-text-muted">
          <span className="text-primary">小说 X 光片报告</span>
          <span>·</span>
          <span>{genre}</span>
          {wordCount && (
            <>
              <span>·</span>
              <span>{wordCount}</span>
            </>
          )}
        </div>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-text">
          {title}
        </h1>
        {oneLineSummary && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
            {oneLineSummary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>
            拆解耗时{" "}
            <span className="tabular-nums text-text">
              {analysis.meta.totalMs
                ? `${(analysis.meta.totalMs / 1000).toFixed(1)}s`
                : "—"}
            </span>
          </span>
          {analysis.meta.degraded && (
            <span className="rounded border border-warning bg-warning/10 px-1.5 py-0.5 text-warning">
              部分降级
            </span>
          )}
          {analysis.plot.status === "error" && (
            <span className="rounded border border-danger bg-danger/10 px-1.5 py-0.5 text-danger">
              拆文分析失败
            </span>
          )}
          {analysis.character.status === "error" && (
            <span className="rounded border border-danger bg-danger/10 px-1.5 py-0.5 text-danger">
              人设分析失败
            </span>
          )}
        </div>
      </header>

      {/* Tab 切换 */}
      <div className="no-print sticky top-0 z-10 -mx-1 flex gap-1 border-b border-border bg-bg/95 px-1 py-2 backdrop-blur-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => t.available && setTab(t.id)}
            disabled={!t.available}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-text-inverse"
                : t.available
                ? "text-text hover:bg-bg-soft"
                : "cursor-not-allowed text-text-muted opacity-40"
            }`}
          >
            {t.label}
            {!t.available && t.id !== "original" && (
              <span className="ml-1.5 text-xs">✕</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="print-block">
        {tab === "plot" && (
          <>
            {plotData ? (
              <PlotReport data={plotData} />
            ) : (
              <div className="rounded-md border border-danger bg-danger/5 p-6 text-center">
                <p className="text-sm text-danger">拆文分析未能完成</p>
                <p className="mt-1 text-xs text-text-muted">
                  {analysis.plot.status === "error" ? analysis.plot.error : "未知错误"}
                </p>
              </div>
            )}
          </>
        )}

        {tab === "character" && (
          <>
            {characterData ? (
              <CharacterReport data={characterData} />
            ) : (
              <div className="rounded-md border border-danger bg-danger/5 p-6 text-center">
                <p className="text-sm text-danger">人设分析未能完成</p>
                <p className="mt-1 text-xs text-text-muted">
                  {analysis.character.status === "error" ? analysis.character.error : "未知错误"}
                </p>
              </div>
            )}
          </>
        )}

        {tab === "original" && (
          <div className="rounded-md border border-border bg-surface p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.15em] text-text-muted">
              原文（{paragraphs.length} 段）
            </div>
            <div className="space-y-4">
              {paragraphs.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 font-mono text-xs leading-[1.85] text-text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 whitespace-pre-wrap font-serif text-[15px] leading-[1.85] text-text">
                    {p}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
