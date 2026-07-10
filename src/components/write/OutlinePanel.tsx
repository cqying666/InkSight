"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type WriteOutline,
  type HookType,
  type ReversalType,
  type EndingType,
  type ReversalPlan,
  HOOK_LABELS,
  REVERSAL_LABELS,
  ENDING_LABELS,
  createEmptyOutline,
  loadOutline,
  saveOutline,
  outlineFromTeardown,
} from "@/lib/write/outline";
import { loadFeedback } from "@/lib/report/session";
import { trackEvent } from "@/lib/report/analytics";

/**
 * P5-T4 结构大纲面板
 *
 * 用户在创作前搭建大纲：钩子/三幕/反转/结局/情绪目标
 * 来源：自定义 / 从拆文结果生成模板（学→创衔接）
 */

interface Props {
  onOutlineChange?: (outline: WriteOutline | null) => void;
}

export function OutlinePanel({ onOutlineChange }: Props) {
  const [outline, setOutline] = useState<WriteOutline | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [hasTeardown, setHasTeardown] = useState(false);
  // P5-T13 降级：拆文数据损坏时提示手动操作
  const [teardownError, setTeardownError] = useState(false);

  // 初始化：加载已有大纲或检查拆文结果
  useEffect(() => {
    const existing = loadOutline();
    if (existing) {
      setOutline(existing);
      onOutlineChange?.(existing);
    }
    // 检查是否有拆文结果可用于生成模板
    try {
      const stored = loadFeedback();
      if (stored && stored.analysis.plot.status === "loaded" && stored.analysis.plot.data) {
        setHasTeardown(true);
      }
    } catch {
      setTeardownError(true);
    }
  }, [onOutlineChange]);

  const updateOutline = useCallback(
    (updater: (prev: WriteOutline) => WriteOutline) => {
      const base = outline || createEmptyOutline();
      const next = { ...updater(base), updatedAt: Date.now() };
      setOutline(next);
      saveOutline(next);
      onOutlineChange?.(next);
    },
    [outline, onOutlineChange]
  );

  const handleCreate = useCallback(() => {
    const next = createEmptyOutline();
    setOutline(next);
    saveOutline(next);
    onOutlineChange?.(next);
    trackEvent("write_outline_created", { source: "blank" });
  }, [onOutlineChange]);

  const handleFromTeardown = useCallback(() => {
    try {
      const stored = loadFeedback();
      if (!stored || stored.analysis.plot.status !== "loaded" || !stored.analysis.plot.data) {
        setTeardownError(true);
        return;
      }
      const next = outlineFromTeardown(stored.analysis.plot.data);
      setOutline(next);
      saveOutline(next);
      onOutlineChange?.(next);
      trackEvent("write_outline_created", { source: "teardown" });
    } catch {
      // P5-T13 降级：拆文数据异常时提示手动搭建
      setTeardownError(true);
    }
  }, [onOutlineChange]);

  const handleDelete = useCallback(() => {
    setOutline(null);
    onOutlineChange?.(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("inksight:write:outline");
    }
  }, [onOutlineChange]);

  // ===== 未创建大纲时：选择入口 =====
  if (!outline) {
    return (
      <div className="rounded-sm border border-accent bg-bg-alt p-4">
        <div className="text-xs uppercase tracking-[0.15em] text-text-muted">
          结构大纲
        </div>
        <p className="mt-1.5 text-sm text-text">
          搭建作品结构骨架，创作时显示参考线
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-full border border-primary bg-primary px-4 py-1.5 font-serif text-xs text-inverse transition-colors hover:bg-primary"
          >
            创建空白大纲
          </button>
          {hasTeardown && (
            <button
              type="button"
              onClick={handleFromTeardown}
              className="rounded-sm border border-accent bg-bg px-4 py-1.5 font-serif text-xs text-accent transition-colors hover:bg-accent/[0.05]"
            >
              从拆文结果生成
            </button>
          )}
        </div>
        {/* P5-T13 降级：拆文数据异常时提示手动搭建 */}
        {teardownError && (
          <p className="mt-2 text-[10px] text-primary">
            拆文数据读取异常，无法自动生成模板，请手动创建空白大纲搭建结构
          </p>
        )}
      </div>
    );
  }

  // ===== 已有大纲：编辑界面 =====
  return (
    <div className="rounded-sm border border-accent bg-bg-alt">
      {/* 折叠头部 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="font-serif text-sm font-semibold text-text">
          结构大纲
        </span>
        <span className="text-xs text-text-muted">
          {expanded ? "收起 ▴" : "展开 ▾"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 px-4 pb-4">
          {/* 钩子类型 */}
          <Field label="开头钩子">
            <select
              value={outline.hookType}
              onChange={(e) =>
                updateOutline((o) => ({
                  ...o,
                  hookType: e.target.value as HookType,
                }))
              }
              className="write-select"
            >
              {Object.entries(HOOK_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={outline.hookNote}
              onChange={(e) =>
                updateOutline((o) => ({ ...o, hookNote: e.target.value }))
              }
              placeholder="钩子说明（如：以一封未拆的信开场）"
              className="write-input mt-1.5"
            />
          </Field>

          {/* 三幕占比 */}
          <Field label="三幕结构占比">
            <div className="space-y-1.5">
              {(
                [
                  ["setup", "建置"],
                  ["confrontation", "对抗"],
                  ["resolution", "解决"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-text-muted">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={outline.threeActRatio[key]}
                    onChange={(e) =>
                      updateOutline((o) => ({
                        ...o,
                        threeActRatio: {
                          ...o.threeActRatio,
                          [key]: Number(e.target.value),
                        },
                      }))
                    }
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-xs text-text">
                    {Math.round(outline.threeActRatio[key] * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </Field>

          {/* 反转节点 */}
          <Field label="反转节点计划">
            <div className="space-y-2">
              {outline.reversals.map((rev, i) => (
                <ReversalEditor
                  key={i}
                  reversal={rev}
                  onChange={(next) =>
                    updateOutline((o) => ({
                      ...o,
                      reversals: o.reversals.map((r, j) =>
                        j === i ? next : r
                      ),
                    }))
                  }
                  onDelete={
                    outline.reversals.length > 1
                      ? () =>
                          updateOutline((o) => ({
                            ...o,
                            reversals: o.reversals.filter((_, j) => j !== i),
                          }))
                      : undefined
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  updateOutline((o) => ({
                    ...o,
                    reversals: [
                      ...o.reversals,
                      { position: 0.75, type: "cognition", note: "" },
                    ],
                  }))
                }
                className="text-xs text-primary underline hover:text-primary"
              >
                + 添加反转
              </button>
            </div>
          </Field>

          {/* 结局类型 */}
          <Field label="结局类型">
            <select
              value={outline.endingType}
              onChange={(e) =>
                updateOutline((o) => ({
                  ...o,
                  endingType: e.target.value as EndingType,
                }))
              }
              className="write-select"
            >
              {Object.entries(ENDING_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          {/* 情绪曲线目标 */}
          <Field label="情绪曲线目标">
            <div className="space-y-1.5">
              <MoodSlider
                label="开篇"
                value={outline.emotionGoal.startMood}
                onChange={(v) =>
                  updateOutline((o) => ({
                    ...o,
                    emotionGoal: { ...o.emotionGoal, startMood: v },
                  }))
                }
              />
              <MoodSlider
                label="中段"
                value={outline.emotionGoal.midMood}
                onChange={(v) =>
                  updateOutline((o) => ({
                    ...o,
                    emotionGoal: { ...o.emotionGoal, midMood: v },
                  }))
                }
              />
              <MoodSlider
                label="结尾"
                value={outline.emotionGoal.endMood}
                onChange={(v) =>
                  updateOutline((o) => ({
                    ...o,
                    emotionGoal: { ...o.emotionGoal, endMood: v },
                  }))
                }
              />
              <input
                type="text"
                value={outline.emotionGoal.trend}
                onChange={(e) =>
                  updateOutline((o) => ({
                    ...o,
                    emotionGoal: { ...o.emotionGoal, trend: e.target.value },
                  }))
                }
                placeholder="走势描述（如：先抑后扬）"
                className="write-input mt-1"
              />
            </div>
          </Field>

          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-text-muted underline hover:text-primary"
          >
            删除大纲
          </button>
        </div>
      )}

      <style>{`
        .write-select {
          width: 100%;
          border: 1px solid rgba(124, 111, 102, 0.3);
          background: var(--color-paper, #FAF7F2);
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 13px;
          color: #1C1C1E;
          outline: none;
        }
        .write-input {
          width: 100%;
          border: 1px solid rgba(124, 111, 102, 0.2);
          background: var(--color-paper, #FAF7F2);
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 13px;
          color: #1C1C1E;
          outline: none;
        }
        .write-input:focus, .write-select:focus {
          border-color: #1C1C1E;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-text">{label}</div>
      {children}
    </div>
  );
}

function ReversalEditor({
  reversal,
  onChange,
  onDelete,
}: {
  reversal: ReversalPlan;
  onChange: (next: ReversalPlan) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-accent bg-bg p-2">
      <span className="text-xs text-text-muted">
        {Math.round(reversal.position * 100)}%
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={reversal.position}
        onChange={(e) =>
          onChange({ ...reversal, position: Number(e.target.value) })
        }
        className="w-20"
      />
      <select
        value={reversal.type}
        onChange={(e) =>
          onChange({
            ...reversal,
            type: e.target.value as ReversalType,
          })
        }
        className="text-xs"
      >
        {Object.entries(REVERSAL_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={reversal.note}
        onChange={(e) => onChange({ ...reversal, note: e.target.value })}
        placeholder="描述"
        className="flex-1 text-xs"
      />
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-text-muted hover:text-primary"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function MoodSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs text-text-muted">{label}</span>
      <input
        type="range"
        min={-5}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span
        className={`w-8 text-right text-xs ${
          value > 0 ? "text-accent" : value < 0 ? "text-primary" : "text-text-muted"
        }`}
      >
        {value > 0 ? "+" : ""}
        {value}
      </span>
    </div>
  );
}
