"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENDING_LABELS,
  HOOK_LABELS,
  REVERSAL_LABELS,
} from "@/lib/write/outline";
import { CHAPTER_PURPOSE_LABELS } from "@/lib/write/chapter";
import { SCENE_PURPOSE_LABELS } from "@/lib/write/scene";
import type { GuideGenerationResult } from "@/lib/write/guide-prompt";
import type { OutlineGenerationResult } from "@/lib/write/chapter";
import type { DetailedOutlineResult } from "@/lib/write/scene";

/**
 * 生成结果确认浮层
 *
 * 根据上一步用户在首页选择的 @ 技能展示不同浮层：
 * - guide: 3 个导语候选卡片，用户选一个后采纳
 * - outline: 展示完整结构化大纲，采纳后写入 documents.outline
 * - detail-outline: 基于当前作品大纲生成细纲，展示后采纳写入 documents.synopsis
 */

export type GenerationType = "guide" | "outline" | "detail-outline";

export interface GenerationPendingState {
  type: GenerationType;
  data: GuideGenerationResult | OutlineGenerationResult | null;
  createdAt: number;
}

interface Props {
  type: GenerationType;
  /** 已生成的数据（guide / outline 模式从 sessionStorage 读取）；detail-outline 模式为 null，由组件内部触发生成 */
  data: GuideGenerationResult | OutlineGenerationResult | null;
  /** 当前作品的大纲文本（detail-outline 模式生成时使用） */
  currentOutlineText: string;
  onAdopt: (payload: {
    type: GenerationType;
    text: string;
    /** 写入目标：draft=正文编辑器，outline/synopsis=对应参考面板 */
    target: "draft" | "outline" | "synopsis";
  }) => void;
  onDiscard: () => void;
}

export function GenerationConfirmOverlay({
  type,
  data,
  currentOutlineText,
  onAdopt,
  onDiscard,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDiscard();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDiscard]);

  if (!mounted) return null;

  const titleMap: Record<GenerationType, string> = {
    guide: "导语候选",
    outline: "大纲预览",
    "detail-outline": "细纲预览",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      onClick={onDiscard}
    >
      <div className="absolute inset-0 bg-primary/30 backdrop-blur-[2px]" />
      <div
        className="relative flex h-[80vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-text/[0.06] bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex h-12 flex-shrink-0 items-center border-b border-text/[0.06] px-5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/50">
              生成结果
            </span>
            <span className="font-serif text-sm font-semibold text-text">
              {titleMap[type]}
            </span>
          </div>
        </div>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {type === "guide" && (
            <GuideContent
              data={data as GuideGenerationResult | null}
              onAdopt={(text) =>
                onAdopt({ type, text, target: "draft" })
              }
              onDiscard={onDiscard}
            />
          )}
          {type === "outline" && (
            <OutlineContent
              data={data as OutlineGenerationResult | null}
              onAdopt={(text) =>
                onAdopt({ type, text, target: "outline" })
              }
              onDiscard={onDiscard}
            />
          )}
          {type === "detail-outline" && (
            <DetailOutlineContent
              currentOutlineText={currentOutlineText}
              onAdopt={(text) =>
                onAdopt({ type, text, target: "synopsis" })
              }
              onDiscard={onDiscard}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ===== 导语候选展示 =====
function GuideContent({
  data,
  onAdopt,
  onDiscard,
}: {
  data: GuideGenerationResult | null;
  onAdopt: (text: string) => void;
  onDiscard: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!data || !data.candidates || data.candidates.length === 0) {
    return (
      <p className="font-serif text-sm text-text-muted">
        未拿到候选结果，请关闭后重试。
      </p>
    );
  }

  const candidates = data.candidates;
  const selected = candidates[selectedIdx];

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="font-serif text-xs text-text-muted">
        选择一个候选后点击「采纳到正文」，导语将插入到正文编辑器光标位置。
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {candidates.map((c, idx) => {
          const active = idx === selectedIdx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? "border-accent-warm bg-accent-warm/[0.04]"
                  : "border-text/[0.06] bg-surface hover:bg-bg-soft/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-accent-warm">
                  候选 {idx + 1}
                </span>
                {active && (
                  <span className="font-mono text-[10px] text-accent-warm">
                    ✓ 已选
                  </span>
                )}
              </div>
              <span className="font-serif text-[11px] text-text-muted">
                钩子类型：{HOOK_LABELS[c.hookType as keyof typeof HOOK_LABELS] || c.hookType}
              </span>
              <span className="font-serif text-[11px] text-text-muted">
                结构模型：{c.guideModel}
              </span>
              <p className="font-serif text-[13px] leading-relaxed text-text line-clamp-4">
                {c.lead}
              </p>
            </button>
          );
        })}
      </div>

      {/* 选中详情 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-text/[0.06] bg-bg-soft/30 p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <Field label="钩子类型" value={HOOK_LABELS[selected.hookType as keyof typeof HOOK_LABELS] || selected.hookType} />
          <Field label="结局走势" value={`${selected.emotionGoal.trend}`} />
          <Field label="结构模型" value={selected.guideModel} fullWidth />
          <Field label="核心梗" value={selected.coreGerm} fullWidth />
          <Field label="钩子说明" value={selected.hookNote} fullWidth />
        </div>
        <div className="rounded-md border border-text/[0.06] bg-surface px-4 py-3">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
            导语正文
          </p>
          <p className="font-serif text-[15px] leading-[1.9] text-text whitespace-pre-wrap">
            {selected.lead}
          </p>
        </div>
      </div>

      <div className="flex flex-shrink-0 justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-text/[0.08] bg-surface px-4 py-2 font-sans text-[12px] text-text-muted transition-colors hover:text-text"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onAdopt(selected.lead)}
          className="rounded-md bg-primary px-4 py-2 font-sans text-[12px] text-text-inverse transition-colors hover:bg-primary/90"
        >
          采纳到正文
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
        {label}
      </span>
      <p className="font-serif text-[12px] text-text">{value || "—"}</p>
    </div>
  );
}

// ===== 大纲展示 =====
function OutlineContent({
  data,
  onAdopt,
  onDiscard,
}: {
  data: OutlineGenerationResult | null;
  onAdopt: (text: string) => void;
  onDiscard: () => void;
}) {
  if (!data) {
    return (
      <p className="font-serif text-sm text-text-muted">
        未拿到大纲结果，请关闭后重试。
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="font-serif text-xs text-text-muted">
        采纳后写入到「大纲」参考面板，可在左侧继续编辑。
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-text/[0.06] bg-bg-soft/30 p-4">
        <Field label="核心梗" value={data.coreGerm} fullWidth />
        {data.goldenFinger && (
          <Field label="金手指" value={data.goldenFinger} fullWidth />
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <Field label="钩子类型" value={HOOK_LABELS[data.hookType] || data.hookType} />
          <Field label="结局类型" value={ENDING_LABELS[data.endingType] || data.endingType} />
          <Field label="三幕占比" value={`${Math.round(data.threeActRatio.setup * 100)}% / ${Math.round(data.threeActRatio.confrontation * 100)}% / ${Math.round(data.threeActRatio.resolution * 100)}%`} />
          <Field label="情绪走势" value={data.emotionGoal.trend} />
        </div>
        <Field label="钩子说明" value={data.hookNote} fullWidth />

        {/* 反转节点 */}
        <div>
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
            反转节点
          </span>
          <ol className="mt-1 space-y-1">
            {data.reversals.map((r, i) => (
              <li key={i} className="font-serif text-[12px] text-text">
                <span className="text-text-muted">
                  {Math.round(r.position * 100)}% ·{" "}
                  {REVERSAL_LABELS[r.type] || r.type}
                  {" · "}
                </span>
                {r.note}
              </li>
            ))}
          </ol>
        </div>

        {/* 章节大纲 */}
        <div>
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
            章节大纲（{data.chapters.length} 章）
          </span>
          <ol className="mt-2 space-y-3">
            {data.chapters.map((ch) => (
              <li
                key={ch.index}
                className="rounded-md border border-text/[0.06] bg-surface px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-serif text-[13px] font-semibold text-text">
                    第 {ch.index} 章 · {ch.title}
                  </p>
                  <span className="font-mono text-[10px] text-text-muted">
                    {ch.wordCount} 字 · {CHAPTER_PURPOSE_LABELS[ch.purpose] || ch.purpose}
                  </span>
                </div>
                <p className="mt-1 font-serif text-[12px] leading-relaxed text-text">
                  {ch.summary}
                </p>
                {ch.keyEvents.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ch.keyEvents.map((ev, i) => (
                      <span
                        key={i}
                        className="rounded-sm bg-bg-soft/60 px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-shrink-0 justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-text/[0.08] bg-surface px-4 py-2 font-sans text-[12px] text-text-muted transition-colors hover:text-text"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onAdopt(formatOutlineToText(data))}
          className="rounded-md bg-primary px-4 py-2 font-sans text-[12px] text-text-inverse transition-colors hover:bg-primary/90"
        >
          采纳到大纲
        </button>
      </div>
    </div>
  );
}

// ===== 细纲展示（基于当前大纲即时生成） =====
function DetailOutlineContent({
  currentOutlineText,
  onAdopt,
  onDiscard,
}: {
  currentOutlineText: string;
  onAdopt: (text: string) => void;
  onDiscard: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<DetailedOutlineResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const generate = async () => {
    if (!currentOutlineText.trim()) {
      setPhase("error");
      setErrorMsg("当前作品没有大纲，请先在「大纲」面板写或采纳大纲后再来生成细纲。");
      return;
    }
    setPhase("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/detailed-outline-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlineJson: currentOutlineText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.detail || "细纲生成失败");
      }
      setResult(json.data as DetailedOutlineResult);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "细纲生成失败");
      setPhase("error");
    }
  };

  // 自动触发一次
  useEffect(() => {
    if (phase === "idle") void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle" || phase === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent-warm border-t-transparent" />
        <p className="font-serif text-sm text-text">
          {phase === "idle" ? "准备基于当前大纲生成细纲…" : "正在生成细纲…"}
        </p>
        <p className="text-xs text-text-muted">通常需要 30-90 秒</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="font-serif text-sm text-danger/90">{errorMsg}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md border border-text/[0.08] bg-surface px-3 py-1.5 font-sans text-[12px] text-text-muted transition-colors hover:text-text"
          >
            取消
          </button>
          <button
            type="button"
            onClick={generate}
            className="rounded-md bg-primary px-3 py-1.5 font-sans text-[12px] text-text-inverse"
          >
            重新生成
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="font-serif text-xs text-text-muted">
        采纳后写入到「细纲」参考面板，可在左侧继续编辑。
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-text/[0.06] bg-bg-soft/30 p-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
          章节细纲（{result.chapterBreakdown.length} 章）
        </span>
        {result.chapterBreakdown.map((cb) => (
          <div
            key={cb.chapterIndex}
            className="rounded-md border border-text/[0.06] bg-surface px-3 py-2"
          >
            <p className="font-serif text-[13px] font-semibold text-text">
              第 {cb.chapterIndex} 章
            </p>
            <ol className="mt-1.5 space-y-1.5">
              {cb.scenes.map((sc, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] text-accent-warm">
                      场景 {i + 1} · {SCENE_PURPOSE_LABELS[sc.purpose] || sc.purpose}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">
                      {sc.wordCount} 字 · 情绪 {sc.emotionPoint}
                    </span>
                  </div>
                  <p className="font-serif text-[12px] leading-relaxed text-text">
                    {sc.content}
                  </p>
                  {sc.dialogue && (
                    <p className="font-serif text-[12px] text-text-muted">
                      对白：{sc.dialogue}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="flex flex-shrink-0 justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-text/[0.08] bg-surface px-4 py-2 font-sans text-[12px] text-text-muted transition-colors hover:text-text"
        >
          取消
        </button>
        <button
          type="button"
          onClick={generate}
          className="rounded-md border border-text/[0.06] px-3 py-2 font-sans text-[12px] text-text-muted transition-colors hover:text-text"
        >
          重新生成
        </button>
        <button
          type="button"
          onClick={() => onAdopt(formatDetailedOutlineToText(result))}
          className="rounded-md bg-primary px-4 py-2 font-sans text-[12px] text-text-inverse transition-colors hover:bg-primary/90"
        >
          采纳到细纲
        </button>
      </div>
    </div>
  );
}

// ===== 格式化函数（写入到 documents 的可读文本） =====

function formatOutlineToText(o: OutlineGenerationResult): string {
  const lines: string[] = [];
  lines.push(`【核心梗】${o.coreGerm}`);
  if (o.goldenFinger) lines.push(`【金手指】${o.goldenFinger}`);
  lines.push(`【钩子类型】${HOOK_LABELS[o.hookType] || o.hookType}`);
  lines.push(`【钩子说明】${o.hookNote}`);
  lines.push(
    `【三幕占比】${Math.round(o.threeActRatio.setup * 100)}% / ${Math.round(o.threeActRatio.confrontation * 100)}% / ${Math.round(o.threeActRatio.resolution * 100)}%`,
  );
  if (o.reversals.length > 0) {
    lines.push("【反转节点】");
    o.reversals.forEach((r, i) => {
      lines.push(
        `  ${i + 1}. ${Math.round(r.position * 100)}% · ${REVERSAL_LABELS[r.type] || r.type} · ${r.note}`,
      );
    });
  }
  lines.push(`【结局类型】${ENDING_LABELS[o.endingType] || o.endingType}`);
  lines.push(
    `【情绪曲线】${o.emotionGoal.startMood} → ${o.emotionGoal.midMood} → ${o.emotionGoal.endMood}（${o.emotionGoal.trend}）`,
  );
  lines.push("");
  lines.push("【章节大纲】");
  o.chapters.forEach((ch) => {
    lines.push(
      `第 ${ch.index} 章 · ${ch.title}（${ch.wordCount} 字 · ${CHAPTER_PURPOSE_LABELS[ch.purpose] || ch.purpose}）`,
    );
    lines.push(`  ${ch.summary}`);
    if (ch.keyEvents.length > 0) {
      lines.push(`  关键事件：${ch.keyEvents.join(" / ")}`);
    }
  });
  return lines.join("\n");
}

function formatDetailedOutlineToText(d: DetailedOutlineResult): string {
  const lines: string[] = [];
  d.chapterBreakdown.forEach((cb) => {
    lines.push(`第 ${cb.chapterIndex} 章`);
    cb.scenes.forEach((sc, i) => {
      lines.push(
        `  场景 ${i + 1} · ${SCENE_PURPOSE_LABELS[sc.purpose] || sc.purpose}（${sc.wordCount} 字 · 情绪 ${sc.emotionPoint}）`,
      );
      lines.push(`    ${sc.content}`);
      if (sc.dialogue) lines.push(`    对白：${sc.dialogue}`);
    });
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}
