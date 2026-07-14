"use client";

import { useCallback } from "react";
import { trackEvent } from "@/lib/report/analytics";
import { useUserProfile } from "@/lib/report/use-user-profile";

interface StageGateProps {
  wordCount: number;
  hasOutline: boolean;
}

// 阅读时长估算：约 350 字/分钟，至少 1 分钟
function readingTime(words: number): string {
  if (words <= 0) return "0 分钟";
  const mins = Math.max(1, Math.ceil(words / 350));
  return `${mins} 分钟`;
}

// 根据字数与用户阶段生成简短下一步建议（10-15 字，以「…」结尾）
function pickHint(
  wordCount: number,
  hasOutline: boolean,
  stage: "newcomer" | "learner" | "creator" | "looped"
): string {
  if (wordCount < 50) return "继续写吧…";
  if (wordCount < 100) {
    return hasOutline ? "快到 100 字，继续写…" : "先搭骨架再下笔…";
  }
  if (wordCount < 500) {
    switch (stage) {
      case "newcomer":
        return "继续写到 500 字完成首篇…";
      case "learner":
        return "继续写到 500 字…";
      case "creator":
        return "写到 500 字可导出存档…";
      case "looped":
        return "写到 500 字可导出存档…";
    }
  }
  switch (stage) {
    case "newcomer":
      return "完成首篇，可导出存档…";
    case "learner":
      return "继续精进，写下一篇…";
    case "creator":
      return "导出存档，继续精进…";
    case "looped":
      return "导出存档，继续精进…";
  }
}

export function StageGate({ wordCount, hasOutline }: StageGateProps) {
  const profile = useUserProfile();
  // 首次渲染 profile 为 null，降级为 newcomer 避免 hydration 不匹配
  const stage = profile?.stage ?? "newcomer";

  const hint = pickHint(wordCount, hasOutline, stage);

  const handleExport = useCallback(() => {
    trackEvent("report_exported", {
      from: "stage_gate",
      word_count: wordCount,
      user_stage: stage,
    });
    window.print();
  }, [wordCount, stage]);

  const showExport = wordCount >= 500;

  return (
    <div className="flex h-10 items-center gap-3 border-t border-border bg-paper px-4">
      {/* 左：字数 + 阅读时长 */}
      <div className="flex flex-shrink-0 items-center gap-2 font-mono text-[10px] text-text-muted tabular-nums">
        <span>{wordCount} 字</span>
        <span className="opacity-40">·</span>
        <span>{readingTime(wordCount)}</span>
      </div>

      {/* 中：动态下一步建议 */}
      <div className="flex-1 truncate text-center font-serif text-[11px] text-text-muted">
        {hint}
      </div>

      {/* 右：导出按钮 */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {showExport && (
          <button
            type="button"
            onClick={handleExport}
            aria-label="导出"
            title="导出"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-accent-warm hover:text-accent-warm"
          >
            <span className="text-[11px] leading-none">⤓</span>
          </button>
        )}
      </div>
    </div>
  );
}
