"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import {
  loadDraft,
  markDraftCompleted,
  saveDraft,
  formatSavedAt,
  SAVE_INTERVAL_MS,
} from "@/lib/write/storage";
import { countWords, estimateReadingTime, htmlToPlainText } from "@/lib/write/stats";
import { trackEvent } from "@/lib/report/analytics";
import { StructureGuide } from "./StructureGuide";
import { StructureHints } from "./StructureHints";
import type { WriteOutline } from "@/lib/write/outline";

/**
 * P5-T1 创作编辑器内核
 *
 * 特性：
 *  - 富文本编辑（加粗/斜体/引用/分隔线）
 *  - 自动保存（30s + 失焦）
 *  - 字数统计 + 预估阅读时长
 *  - 章节分隔（插入章节标题）
 *  - 段落编号预留（P5-T2 实现）
 *
 * PRD 5.7：干扰极简的写作环境
 */

interface Props {
  onFocusModeChange?: (focusMode: boolean) => void;
  onWordCountChange?: (count: number) => void;
  outline?: WriteOutline | null;
}

export function Editor({ onFocusModeChange, onWordCountChange, outline }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [completed, setCompleted] = useState(false);

  // P5-T3: 专注模式状态持久化
  const FOCUS_KEY = "inksight:write:focus";

  // 持久化到 localStorage 的标志，避免 SSR 不一致
  const hasLoadedRef = useRef(false);
  const writingStartedRef = useRef(false);

  // ===== 初始化：加载草稿 + 专注模式状态 =====
  useEffect(() => {
    setMounted(true);
    const draft = loadDraft();
    if (draft) {
      if (titleRef.current) titleRef.current.value = draft.title;
      if (editorRef.current) editorRef.current.innerHTML = draft.html;
      setSavedAt(draft.savedAt);
      setCompleted(Boolean(draft.completedAt));
      const html = editorRef.current?.innerHTML || "";
      setWordCount(countWords(htmlToPlainText(html)));
    }
    // P5-T3: 恢复专注模式状态
    try {
      if (localStorage.getItem(FOCUS_KEY) === "1") {
        setFocusMode(true);
        onFocusModeChange?.(true);
      }
    } catch {
      // ignore
    }
    hasLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 统计更新 =====
  const updateStats = useCallback(() => {
    const html = editorRef.current?.innerHTML || "";
    const plain = htmlToPlainText(html);
    setWordCount(countWords(plain));
  }, []);

  // P5-T12: 向上通知字数变化（供 WriteNextSteps 动态推荐）
  useEffect(() => {
    onWordCountChange?.(wordCount);
  }, [wordCount, onWordCountChange]);

  // ===== 保存 =====
  const handleSave = useCallback(() => {
    if (!hasLoadedRef.current) return false;
    const title = titleRef.current?.value || "";
    const html = editorRef.current?.innerHTML || "";
    const plainText = htmlToPlainText(html);
    if (!title && !plainText) return false; // 空内容不保存
    const ts = saveDraft({ title, html, plainText });
    if (ts > 0) {
      setSavedAt(ts);
      setDirty(false);
      setSaveError(false);
      trackEvent("draft_saved", { word_count: countWords(plainText) });
      return true;
    } else {
      setSaveError(true);
      return false;
    }
  }, []);

  // ===== 自动保存：30s 间隔 =====
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirty) handleSave();
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dirty, handleSave]);

  // ===== 失焦保存 =====
  const handleBlur = useCallback(() => {
    if (dirty) handleSave();
  }, [dirty, handleSave]);

  // ===== 内容变化 =====
  const handleInput = useCallback(() => {
    if (!writingStartedRef.current) {
      writingStartedRef.current = true;
      trackEvent("writing_started", {});
    }
    setDirty(true);
    if (completed) setCompleted(false);
    setSaveError(false);
    updateStats();
  }, [completed, updateStats]);

  const handleTitleChange = useCallback(() => {
    if (!writingStartedRef.current) {
      writingStartedRef.current = true;
      trackEvent("writing_started", {});
    }
    setDirty(true);
    if (completed) setCompleted(false);
    setSaveError(false);
  }, [completed]);

  useEffect(() => {
    const handleExternalChange = () => handleInput();
    window.addEventListener("inksight:editor-change", handleExternalChange);
    return () => window.removeEventListener("inksight:editor-change", handleExternalChange);
  }, [handleInput]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleSave]);

  // ===== 富文本格式化命令 =====
  const execCmd = useCallback((command: string, value?: string) => {
    // document.execCommand 已废弃但所有浏览器仍支持，是最轻量的富文本方案
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  }, [handleInput]);

  // ===== 插入章节分隔 =====
  const insertChapter = useCallback(() => {
    editorRef.current?.focus();
    // 根据已有章节数计算下一章编号（用户手写首章，从第二章开始插入）
    const existing = editorRef.current?.querySelectorAll(".chapter-title").length ?? 0;
    const chapterNum = existing + 2;
    const chineseNum = ["二", "三", "四", "五", "六", "七", "八", "九", "十"][chapterNum - 2] || String(chapterNum);
    const chapterTitle = `第${chineseNum}章`;
    document.execCommand(
      "insertHTML",
      false,
      `<h2 class="chapter-title">${chapterTitle}</h2><p></p>`
    );
    handleInput();
  }, [handleInput]);

  // ===== 插入分隔线 =====
  const insertDivider = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand("insertHorizontalRule");
    handleInput();
  }, [handleInput]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const plainText = event.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, plainText);
      handleInput();
    },
    [handleInput]
  );

  const markCompleted = useCallback(() => {
    if (!handleSave()) return;
    if (!markDraftCompleted()) {
      setSaveError(true);
      return;
    }
    setCompleted(true);
    trackEvent("draft_completed", { word_count: wordCount });
  }, [handleSave, wordCount]);

  // ===== 全屏专注模式（P5-T3：状态持久化）=====
  const toggleFocusMode = useCallback(() => {
    const next = !focusMode;
    setFocusMode(next);
    onFocusModeChange?.(next);
    try {
      localStorage.setItem(FOCUS_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    trackEvent("write_focus_mode_toggled", { enabled: next });
  }, [focusMode, onFocusModeChange, FOCUS_KEY]);

  // ===== 离开页面前保存 =====
  useEffect(() => {
    const handler = () => {
      if (dirty) {
        const title = titleRef.current?.value || "";
        const html = editorRef.current?.innerHTML || "";
        const plainText = htmlToPlainText(html);
        if (title || plainText) saveDraft({ title, html, plainText });
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const readingTime = estimateReadingTime(wordCount);

  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-text-muted">加载编辑器…</div>
      </div>
    );
  }

  return (
    <div className={focusMode ? "fixed inset-0 z-50 bg-bg" : ""}>
      {/* 顶部状态栏 */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-accent bg-bg px-5 py-2.5 backdrop-blur">
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="font-serif text-sm text-text">
            {wordCount.toLocaleString()} 字
          </span>
          <span>·</span>
          <span>约 {readingTime} 分钟阅读</span>
          <span>·</span>
          <span>
            {saveError ? (
              <span className="text-primary">保存失败，请检查浏览器存储后重试</span>
            ) : dirty ? (
              <span className="text-accent">编辑中…</span>
            ) : savedAt ? (
              <span>已保存 {formatSavedAt(savedAt)}</span>
            ) : (
              <span>未保存</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty && !saveError}
            className="rounded-sm border border-text/[0.12] px-3 py-1 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-35"
          >
            保存
          </button>
          <button
            type="button"
            onClick={markCompleted}
            disabled={wordCount === 0 || completed}
            className="rounded-sm border border-accent/30 px-3 py-1 font-serif text-xs text-accent transition-colors hover:bg-accent/[0.05] disabled:opacity-35"
          >
            {completed ? "已标记完成" : "标记完成"}
          </button>
          <button
            type="button"
            onClick={toggleFocusMode}
            className="rounded-sm border border-text px-3 py-1 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary"
          >
            {focusMode ? "退出专注" : "专注模式"}
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      {!focusMode && (
        <div className="no-print flex items-center gap-1 border-b border-accent bg-bg-alt px-5 py-1.5">
          <ToolbarButton onClick={() => execCmd("bold")} label="加粗" shortcut="⌘B">
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("italic")} label="斜体" shortcut="⌘I">
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("strikeThrough")} label="删除线">
            <span className="line-through">S</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => execCmd("formatBlock", "blockquote")}
            label="引用"
          >
            <span className="font-serif">&ldquo;</span>
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-text" />
          <ToolbarButton onClick={() => execCmd("undo")} label="撤销" shortcut="⌘Z">
            <span className="text-xs">↶</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("redo")} label="重做" shortcut="⇧⌘Z">
            <span className="text-xs">↷</span>
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-text" />
          <ToolbarButton onClick={() => execCmd("formatBlock", "h2")} label="二级标题">
            <span className="text-[10px]">H2</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("insertUnorderedList")} label="项目列表">
            <span className="text-xs">•≡</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("insertOrderedList")} label="编号列表">
            <span className="text-[10px]">1≡</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => execCmd("removeFormat")} label="清除格式">
            <span className="text-[10px]">Tx</span>
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-text" />
          <ToolbarButton onClick={insertChapter} label="插入章节">
            <span className="text-xs">章</span>
          </ToolbarButton>
          <ToolbarButton onClick={insertDivider} label="分隔线">
            <span className="text-xs">—</span>
          </ToolbarButton>
        </div>
      )}

      {/* 标题输入 */}
      <div className="mx-auto max-w-4xl px-6 pt-8">
        <input
          ref={titleRef}
          type="text"
          placeholder="作品标题…"
          onBlur={handleBlur}
          onChange={handleTitleChange}
          className="w-full border-none bg-transparent font-serif text-3xl font-semibold text-text outline-none placeholder:text-text-muted"
        />
      </div>

      {/* 编辑区 + 结构参考线（P5-T5）*/}
      <div className="mx-auto flex max-w-4xl px-6 py-6">
        {/* 结构参考线：仅在有大纲且非专注模式时显示 */}
        {!focusMode && outline && (
          <div className="no-print mr-2 min-h-[55vh]">
            <StructureGuide outline={outline} />
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onPaste={handlePaste}
          className="write-editor min-h-[55vh] flex-1 font-serif text-[17px] leading-[1.9] text-text outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_.chapter-title]:mt-6 [&_.chapter-title]:border-b [&_.chapter-title]:border-accent [&_.chapter-title]:pb-1 [&_.chapter-title]:font-serif [&_.chapter-title]:text-xl [&_.chapter-title]:font-semibold [&_hr]:my-4 [&_hr]:border-none [&_hr]:text-center [&_hr]:before:content-['* * *'] [&_hr]:before:text-text-muted [&_p]:my-1.5"
          data-placeholder="开始写作…"
        />
      </div>

      {/* P5-T9 实时结构提示（非专注模式时底部显示）*/}
      {!focusMode && (
        <StructureHints
          editorRef={editorRef}
          outline={outline}
          wordCount={wordCount}
        />
      )}

      {/* 段落编号系统（P5-T2）+ 空状态提示 */}
      <style>{`
        .write-editor { counter-reset: para; }
        .write-editor p { counter-increment: para; }
        .write-editor p:before {
          content: counter(para, decimal-leading-zero);
          display: inline-block;
          width: 2em;
          margin-left: -2.5em;
          text-align: right;
          font-size: 0.7em;
          color: rgba(124, 111, 102, 0.35);
          font-family: "Inter", sans-serif;
          user-select: none;
          vertical-align: top;
          padding-top: 0.3em;
        }
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(28, 28, 30, 0.25);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  onClick,
  children,
  label,
  shortcut,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex h-7 w-7 items-center justify-center rounded-sm text-sm text-text transition-colors hover:bg-accent/[0.05] hover:text-text"
    >
      {children}
    </button>
  );
}
