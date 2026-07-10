"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WriteOutline } from "@/lib/write/outline";
import { REVERSAL_LABELS } from "@/lib/write/outline";
import { classifyParagraph, htmlToPlainText, countWords } from "@/lib/write/stats";

/**
 * P5-T9 实时结构提示（轻量版）
 *
 * PRD 5.7 底部状态条：
 *  - 当前进度 X% (字数/目标)
 *  - 段落类型：对话/叙述
 *  - 三幕进度条 + "你在这里"
 *  - 计划反转节点距离（接近时变淡黄色）
 *  - 情绪概览
 *
 * 设计原则：只提醒位置不评价内容，静态展示不弹窗不闪烁
 */

interface Props {
  editorRef: React.RefObject<HTMLDivElement | null>;
  outline: WriteOutline | null | undefined;
  wordCount: number;
  targetWords?: number;
}

export function StructureHints({
  editorRef,
  outline,
  wordCount,
  targetWords = 7500,
}: Props) {
  const [cursorPos, setCursorPos] = useState(0); // 0-1
  const [paragraphType, setParagraphType] = useState<"dialogue" | "narration" | "chapter">("narration");
  const [degraded, setDegraded] = useState(false);
  const tickRef = useRef<number>(0);
  const failCountRef = useRef(0);
  // 保持 degraded 的最新引用，避免 useCallback 闭包陈旧
  const degradedRef = useRef(false);
  const FAIL_THRESHOLD = 3;

  // 跟踪光标位置
  const updateCursorInfo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // P5-T13 降级机制：DOM 操作可能抛错（节点脱离/Range 失效），
    // 连续失败超过阈值时隐藏底部条，避免持续报错干扰写作
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      // 确保光标在编辑器内
      if (!editor.contains(range.commonAncestorContainer)) return;

      // 计算光标在全文中的位置百分比
      const fullText = htmlToPlainText(editor.innerHTML);
      const totalLen = fullText.length;
      if (totalLen === 0) return;

      // 创建从编辑器开始到光标的 range
      const preRange = document.createRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.endContainer, range.endOffset);
      const preText = preRange.toString();
      const pos = Math.min(1, preText.length / totalLen);
      setCursorPos(pos);

      // 判断当前段落类型
      let node: Node | null = range.endContainer;
      while (node && node !== editor) {
        if (node.nodeName === "P") {
          setParagraphType(classifyParagraph(node.textContent || ""));
          break;
        }
        if (node.nodeName === "H2" || node.nodeName === "H3") {
          setParagraphType("chapter");
          break;
        }
        node = node.parentNode;
      }
      // 成功一次即清零失败计数，并在已降级时恢复
      failCountRef.current = 0;
      if (degradedRef.current) {
        degradedRef.current = false;
        setDegraded(false);
      }
    } catch {
      failCountRef.current += 1;
      if (failCountRef.current >= FAIL_THRESHOLD) {
        degradedRef.current = true;
        setDegraded(true);
      }
    }
  }, [editorRef]);

  // 监听选区变化（光标移动）
  useEffect(() => {
    const handler = () => {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = requestAnimationFrame(updateCursorInfo);
    };
    document.addEventListener("selectionchange", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      cancelAnimationFrame(tickRef.current);
    };
  }, [updateCursorInfo]);

  // 无大纲时显示简化版
  if (!outline) {
    return (
      <div className="no-print border-t border-accent bg-bg-alt px-5 py-2">
        <div className="mx-auto flex max-w-4xl items-center gap-4 text-xs text-text-muted">
          <span>
            {wordCount.toLocaleString()} / {targetWords.toLocaleString()} 字
          </span>
          <span>·</span>
          <span>{Math.round((wordCount / targetWords) * 100)}%</span>
          <span className="ml-auto text-text-muted">
            创建结构大纲以获得实时结构提示
          </span>
        </div>
      </div>
    );
  }

  // P5-T13 降级机制：连续失败时隐藏结构提示，仅保留字数
  if (degraded) {
    return (
      <div className="no-print border-t border-accent bg-bg-alt px-5 py-2">
        <div className="mx-auto flex max-w-4xl items-center gap-4 text-xs text-text-muted">
          <span>
            {wordCount.toLocaleString()} / {targetWords.toLocaleString()} 字
          </span>
          <span>·</span>
          <span>{Math.round((wordCount / targetWords) * 100)}%</span>
          <span className="ml-auto text-text-muted">
            实时结构提示暂时不可用（光标追踪异常）
          </span>
        </div>
      </div>
    );
  }

  // 计算三幕阶段
  const setupEnd = outline.threeActRatio.setup;
  const confEnd = setupEnd + outline.threeActRatio.confrontation;
  let actName = "建置";
  if (cursorPos >= confEnd) actName = "解决";
  else if (cursorPos >= setupEnd) actName = "对抗";

  // 找最近反转节点（无反转节点时跳过相关计算，避免 undefined 访问崩溃）
  let nearestReversal = outline.reversals[0];
  let nearestDist = 1;
  for (const rev of outline.reversals) {
    const dist = Math.abs(cursorPos - rev.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestReversal = rev;
    }
  }
  const nearReversal = nearestReversal ? nearestDist < 0.05 : false; // 5% 范围内
  const passedReversal = nearestReversal
    ? cursorPos > nearestReversal.position + 0.02
    : false;

  // 情绪目标
  const { startMood, midMood, endMood } = outline.emotionGoal;
  let targetMood = startMood;
  if (cursorPos >= confEnd) targetMood = endMood;
  else if (cursorPos >= setupEnd) targetMood = midMood;

  const paraTypeLabel =
    paragraphType === "dialogue" ? "对话" : paragraphType === "chapter" ? "章节" : "叙述";

  return (
    <div className="no-print border-t border-accent bg-bg-alt px-5 py-2.5">
      <div className="mx-auto max-w-4xl space-y-1.5">
        {/* 第一行：进度 + 段落类型 + 情绪 */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-text-muted">
            当前进度:{" "}
            <span className="font-medium text-text">
              {Math.round(cursorPos * 100)}%
            </span>
            <span className="ml-1 text-text-muted">
              ({wordCount.toLocaleString()}/{targetWords.toLocaleString()}字)
            </span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">
            段落类型:{" "}
            <span className="font-medium text-text">{paraTypeLabel}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">
            目标情绪:{" "}
            <span
              className={
                targetMood > 0
                  ? "font-medium text-accent"
                  : targetMood < 0
                  ? "font-medium text-primary"
                  : "font-medium text-text"
              }
            >
              {targetMood > 0 ? "+" : ""}
              {targetMood}
            </span>
          </span>
        </div>

        {/* 第二行：三幕进度条 */}
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-accent">
            {/* 三幕分段 */}
            <div
              className="absolute inset-y-0 left-0 bg-accent"
              style={{ width: `${setupEnd * 100}%` }}
            />
            <div
              className="absolute inset-y-0 bg-accent"
              style={{
                left: `${setupEnd * 100}%`,
                width: `${outline.threeActRatio.confrontation * 100}%`,
              }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-accent"
              style={{ width: `${outline.threeActRatio.resolution * 100}%` }}
            />
            {/* 反转节点标记 */}
            {outline.reversals.map((rev, i) => (
              <div
                key={i}
                className="absolute top-0 h-full w-0.5 bg-primary"
                style={{ left: `${rev.position * 100}%` }}
                title={`${REVERSAL_LABELS[rev.type]} ${Math.round(rev.position * 100)}%`}
              />
            ))}
            {/* 当前位置标记 */}
            <div
              className="absolute top-0 h-full w-1 bg-text"
              style={{ left: `${cursorPos * 100}%` }}
            >
              <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-text" />
            </div>
          </div>
          <span className="w-10 text-right">{actName}段</span>
        </div>

        {/* 第三行：反转提示（接近时变淡黄） */}
        {outline.reversals.length === 0 ? (
          <div className="text-[10px] text-text-muted">
            当前大纲未设置反转节点
          </div>
        ) : passedReversal ? (
          <div className="text-[10px] text-primary">
            ⚠ 计划反转节点在 {Math.round(nearestReversal.position * 100)}%
            （{REVERSAL_LABELS[nearestReversal.type]}）— 你已经过了，是否安排了反转？
          </div>
        ) : nearReversal ? (
          <div className="text-[10px]" style={{ color: "#B8860B" }}>
            ◉ 接近计划反转节点（{REVERSAL_LABELS[nearestReversal.type]}）·
            距 {Math.round(nearestDist * 100)}%
          </div>
        ) : (
          <div className="text-[10px] text-text-muted">
            下一个反转节点在 {Math.round(nearestReversal.position * 100)}%
            · 距 {Math.round(nearestDist * 100)}%
          </div>
        )}
      </div>
    </div>
  );
}
