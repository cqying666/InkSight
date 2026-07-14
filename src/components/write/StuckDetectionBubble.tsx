"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { trackEvent } from "@/lib/report/analytics";
import { CloseIcon } from "@/components/workspace/icons";

/**
 * 卡住检测 + AI 教练气泡
 *
 * 用户在创作工作台写作时，若停止输入超过 IDLE_THRESHOLD_MS（默认 2 分钟），
 * 从右下角冒出一个温和的 AI 教练气泡，邀请其与教练聊聊。
 *
 * 触发条件：isActive && wordCount >= MIN_WORDS && 本次会话未关闭过。
 * 字数变化（用户恢复输入）→ 自动隐藏；✕ 关闭 → 本次会话不再出现。
 */

interface StuckDetectionBubbleProps {
  wordCount: number; // 当前字数，变化时重置计时器
  isActive: boolean; // 是否在写作视图（非 draft 视图时不触发）
  onOpenCoach: (anchor?: { top: number; left: number }) => void; // 打开 AI 教练
}

const IDLE_THRESHOLD_MS = 120_000; // 2 分钟无输入
const MIN_WORDS = 10; // 字数少于此值不触发（刚开始写不算卡住）
const EXIT_ANIM_MS = 220; // 退场动画时长，与 transition 时长对齐
const SESSION_KEY = "inksight:stuck-bubble-dismissed"; // 会话级关闭标记

export function StuckDetectionBubble({
  wordCount,
  isActive,
  onOpenCoach,
}: StuckDetectionBubbleProps) {
  // rendered：DOM 是否存在；shown：是否处于可见视觉态（驱动过渡）
  const [rendered, setRendered] = useState(false);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // 气泡当前是否处于显示态（含退场过渡期间），用作 effect 内的读取值
  const shownRef = useRef(false);
  const lastWordCountRef = useRef(wordCount);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // 读取会话级关闭标记（在 effect 中读，避免 SSR hydration 不一致）
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // 静默：无 sessionStorage 时按未关闭处理
    }
  }, []);

  // 显示气泡：先挂载 DOM，下一帧再切到可见态以触发入场过渡
  const showBubble = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    shownRef.current = true;
    setRendered(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setShown(true);
    });
  }, []);

  // 隐藏气泡：先切到不可见态播退场动画，超时后卸载 DOM
  const hideBubble = useCallback(() => {
    shownRef.current = false;
    setShown(false);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setRendered(false);
      exitTimerRef.current = null;
    }, EXIT_ANIM_MS);
  }, []);

  // 核心计时逻辑：wordCount / isActive / dismissed 变化时重置
  useEffect(() => {
    // 清掉上一轮空闲计时
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // 字数变化（用户恢复输入）→ 更新记录 + 隐藏气泡
    if (wordCount !== lastWordCountRef.current) {
      lastWordCountRef.current = wordCount;
      if (shownRef.current) {
        hideBubble();
      }
    }

    // 不满足触发条件 → 不计时（并确保气泡隐藏）
    if (!isActive || dismissed || wordCount < MIN_WORDS) {
      if (shownRef.current) {
        hideBubble();
      }
      return;
    }

    // 启动空闲计时，到点显示气泡
    timerRef.current = setTimeout(() => {
      showBubble();
      trackEvent("stuck_bubble_shown", { word_count: wordCount });
    }, IDLE_THRESHOLD_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [wordCount, isActive, dismissed, showBubble, hideBubble]);

  // 卸载时清理所有定时器 / rAF
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 点击气泡或「聊聊」→ 打开教练 + 隐藏气泡
  const handleOpen = useCallback(() => {
    trackEvent("stuck_bubble_clicked", { word_count: wordCount });
    hideBubble();
    onOpenCoach();
  }, [hideBubble, onOpenCoach, wordCount]);

  // 关闭气泡（✕）→ 写会话标记，本次会话不再出现
  const handleClose = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // 静默
    }
    setDismissed(true);
    hideBubble();
  }, [hideBubble]);

  if (!rendered) return null;

  return (
    <div
      role="dialog"
      aria-label="AI 教练提示"
      className={`pointer-events-auto fixed bottom-20 right-6 z-40 max-w-[280px] transition-all duration-200 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="relative rounded-lg border border-text/[0.06] bg-surface px-4 py-3 shadow-card">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="关闭提示"
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-text-muted/55 transition-colors hover:bg-bg-soft hover:text-text-muted"
        >
          <CloseIcon className="h-3 w-3" />
        </button>

        {/* 主体：点击打开教练 */}
        <button
          type="button"
          onClick={handleOpen}
          className="block w-full pr-6 text-left"
        >
          <div className="flex items-start gap-3">
            {/* 教练头像 */}
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-warm/[0.10]">
              <span className="font-serif text-[12px] font-semibold text-accent-warm">
                教
              </span>
            </span>
            <p className="font-serif text-[13px] leading-[1.55] text-text">
              卡住了？我可以帮你想想接下来怎么写。
            </p>
          </div>
        </button>

        {/* 「聊聊」圆形图标按钮，与正文左对齐 */}
        <div className="mt-2 pl-10">
          <button
            type="button"
            onClick={handleOpen}
            aria-label="和教练聊聊"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-text-inverse transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-3.5 w-3.5"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
