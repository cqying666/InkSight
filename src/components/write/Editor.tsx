"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useCallback, useEffect, useState } from "react";
import {
  upsertWork,
  formatSavedAt,
  generateId,
  SAVE_INTERVAL_MS,
  type WorkData,
} from "@/lib/write/storage";
import { countWords, estimateReadingTime } from "@/lib/write/stats";
import { trackEvent } from "@/lib/report/analytics";
import type { WorkspaceDocuments } from "@/lib/write/documents";

/**
 * 旧数据兼容处理：
 * 1) 移除 h2 上的 class="chapter-title"（StarterKit heading schema 不支持 class）
 * 2) 外部粘贴的纯文本含 \r\n，曾被合并进单个 <p>，加载时段落分隔丢失。
 *    把 <p>...</p> 内的 \r\n 拆成多个 <p>，恢复段落结构。
 *    若包含「第N章」行，识别为章节标题，转为 <h2>。
 */
function normalizeLegacyHtml(html: string): string {
  let out = html.replace(/<h2\s+class="chapter-title">/g, "<h2>");
  // 拆分 <p>...</p> 内的 \r\n（或多个连续 \n）为多个段落
  out = out.replace(/<p>([\s\S]*?)<\/p>/g, (full, inner: string) => {
    if (!/\r\n|\n{2,}/.test(inner)) return full;
    const lines = inner
      .split(/\r\n|\n{2,}/)
      .map((s) => s.replace(/^\n+|\n+$/g, "").trim())
      .filter((s) => s.length > 0);
    if (lines.length <= 1) return full;
    return lines
      .map((line) => {
        // 「第N章」开头识别为章节标题
        if (/^第[一二三四五六七八九十百零\d]+章/.test(line)) {
          return `<h2>${line}</h2>`;
        }
        return `<p>${line}</p>`;
      })
      .join("");
  });
  return out;
}

/**
 * 新建作品编辑器内核（Tiptap 版）
 *
 * - 无 initialWorkId 时为「新建」模式：每次进入都是空白页
 * - 有 initialWorkId 时为「编辑」模式：用作品的 title/html 灌入初始值
 * 用户输入后自动保存到「我的作品」（含参考文档）。
 * - 工具栏精简为 4 核心按钮 + 更多 overflow（A2）
 * - 字数统计 debounce 300ms + dirty 标记（A1）
 * - 自动归档到作品列表（30s + 失焦 + beforeunload + 卸载）
 */

interface Props {
  onFocusModeChange?: (focusMode: boolean) => void;
  onWordCountChange?: (count: number) => void;
  onOpenCoach?: () => void;
  /** 编辑模式：作品 id（用于 upsert 同一篇作品） */
  initialWorkId?: string;
  /** 编辑模式：作品标题，灌入标题输入框 */
  initialTitle?: string;
  /** 编辑模式：作品正文 HTML，灌入 Tiptap */
  initialHtml?: string;
  /** 参考文档 ref，保存作品时一并写入 */
  documentsRef?: React.MutableRefObject<WorkspaceDocuments>;
  /** 新建模式下首次保存生成作品 id 后回调，供父组件切换为编辑模式保存参考文档 */
  onWorkIdGenerated?: (id: string) => void;
  /** 外部（参考文档）自动创建作品后回填的 id，同步到 Editor 内部 workIdRef */
  externalWorkId?: string | null;
}

const FONT_SCALE_KEY = "inksight:write:font-scale";
const FONT_SCALES = [15, 17, 19, 22];
const DEFAULT_FONT_SCALE = 17;

export function Editor({
  onFocusModeChange,
  onWordCountChange,
  onOpenCoach,
  initialWorkId,
  initialTitle,
  initialHtml,
  documentsRef,
  onWorkIdGenerated,
  externalWorkId,
}: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const wordCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const writingStartedRef = useRef(false);
  const workIdRef = useRef<string | null>(initialWorkId ?? null);
  const onWordCountChangeRef = useRef(onWordCountChange);
  const onFocusModeChangeRef = useRef(onFocusModeChange);
  const onOpenCoachRef = useRef(onOpenCoach);
  const onWorkIdGeneratedRef = useRef(onWorkIdGenerated);
  const saveFnRef = useRef<() => Promise<boolean>>(async () => false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const [wordCount, setWordCount] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [fontScale, setFontScale] = useState(DEFAULT_FONT_SCALE);

  const FOCUS_KEY = "inksight:write:focus";

  // 保持 ref 同步（Tiptap 回调在创建时绑定，需通过 ref 访问最新值）
  useEffect(() => {
    onWordCountChangeRef.current = onWordCountChange;
  }, [onWordCountChange]);
  useEffect(() => {
    onFocusModeChangeRef.current = onFocusModeChange;
  }, [onFocusModeChange]);
  useEffect(() => {
    onOpenCoachRef.current = onOpenCoach;
  }, [onOpenCoach]);
  useEffect(() => {
    onWorkIdGeneratedRef.current = onWorkIdGenerated;
  }, [onWorkIdGenerated]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // 外部（参考文档）自动创建作品后回填的 id，同步到 Editor 内部 workIdRef
  // 避免后续 Editor 保存正文时重复创建新作品
  useEffect(() => {
    if (externalWorkId && !workIdRef.current) {
      workIdRef.current = externalWorkId;
    }
  }, [externalWorkId]);

  // ===== Tiptap 编辑器创建 =====
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
      }),
      Placeholder.configure({
        placeholder: "开始写作…",
        emptyNodeClass: "is-editor-empty",
      }),
    ],
    // 旧数据兼容：
    // 1) 移除 h2 上的 class="chapter-title"（StarterKit heading schema 不支持 class）
    // 2) 外部粘贴的纯文本含 \r\n，曾被合并进单个 <p>，加载时段落分隔丢失。
    //    把 <p>...</p> 内的 \r\n 拆成多个 <p>，恢复段落结构。
    content: initialHtml
      ? normalizeLegacyHtml(initialHtml)
      : "",
    editorProps: {
      attributes: {
        class:
          "write-editor min-h-[55vh] flex-1 font-serif leading-[1.9] text-text outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-accent [&_h2]:pb-1 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_hr]:my-4 [&_hr]:border-none [&_p]:my-1.5",
        style: `font-size: ${fontScale}px`,
      },
      // 粘贴纯文本，去除格式
      handlePaste: (view, event) => {
        const plainText = event.clipboardData?.getData("text/plain");
        if (plainText) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(plainText));
          return true;
        }
        return false;
      },
      // / 键唤出 AI 教练（仅在空段落行首）
      handleKeyDown: (view, event) => {
        if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
          return false;
        }
        const { state } = view;
        const { selection } = state;
        const $pos = selection.$from;
        // 仅当光标在段落行首且段落为空时触发
        if ($pos.parent.type.name !== "paragraph") return false;
        if ($pos.parentOffset !== 0) return false;
        if ($pos.parent.textContent.length > 0) return false;
        event.preventDefault();
        onOpenCoachRef.current?.();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (!writingStartedRef.current) {
        writingStartedRef.current = true;
        trackEvent("writing_started", {});
      }
      dirtyRef.current = true;
      setDirty(true);
      setSaveError(false);
      // debounce 300ms 字数统计（A1）
      if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
      wordCountTimerRef.current = setTimeout(() => {
        const text = editor.getText();
        const wc = countWords(text);
        setWordCount(wc);
        onWordCountChangeRef.current?.(wc);
      }, 300);
    },
    onBlur: () => {
      if (dirtyRef.current) void saveFnRef.current();
    },
  });

  // ===== 保存到「我的作品」（upsert） =====
  const handleSave = useCallback(async () => {
    if (!editor || !hasLoadedRef.current) return false;
    const title = titleRef.current?.value || "";
    const html = editor.getHTML();
    const plainText = editor.getText();
    if (!title && !plainText) return false;
    const savedAt = Date.now();
    const wasNew = workIdRef.current === null;
    const id = workIdRef.current ?? generateId();
    const work: WorkData = {
      id,
      title,
      html,
      plainText,
      savedAt,
      completedAt: savedAt,
      documents: documentsRef?.current,
    };
    workIdRef.current = id;
    if (wasNew) {
      onWorkIdGeneratedRef.current?.(id);
    }
    try {
      await upsertWork(work);
    } catch {
      setSaveError(true);
      return false;
    }
    setSavedAt(savedAt);
    setDirty(false);
    dirtyRef.current = false;
    setSaveError(false);
    trackEvent("draft_saved", { word_count: countWords(plainText) });
    return true;
  }, [editor, documentsRef]);

  useEffect(() => {
    saveFnRef.current = handleSave;
  }, [handleSave]);

  // ===== 初始化：编辑模式灌入内容后同步字数 + 恢复专注模式 + 字号 =====
  useEffect(() => {
    if (!editor) return;
    setMounted(true);
    hasLoadedRef.current = true;
    // 编辑模式：加载已有内容后立即同步字数统计
    if (initialHtml) {
      const text = editor.getText();
      const wc = countWords(text);
      setWordCount(wc);
      onWordCountChangeRef.current?.(wc);
    }
    try {
      if (localStorage.getItem(FOCUS_KEY) === "1") {
        setFocusMode(true);
        onFocusModeChangeRef.current?.(true);
      }
      const storedScale = localStorage.getItem(FONT_SCALE_KEY);
      if (storedScale) {
        const s = parseInt(storedScale, 10);
        if (FONT_SCALES.includes(s)) setFontScale(s);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, FOCUS_KEY, FONT_SCALE_KEY, initialHtml]);

  // ===== 自动保存 30s =====
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirtyRef.current) void saveFnRef.current();
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // ===== ⌘S 快捷键 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFnRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ===== beforeunload 保存 =====
  useEffect(() => {
    const handler = () => {
      if (dirtyRef.current && editor) {
        const title = titleRef.current?.value || "";
        const html = editor.getHTML();
        const plainText = editor.getText();
        if (title || plainText) {
          const savedAt = Date.now();
          const id = workIdRef.current ?? generateId();
          workIdRef.current = id;
          const work: WorkData = {
            id,
            title,
            html,
            plainText,
            savedAt,
            completedAt: savedAt,
            documents: documentsRef?.current,
          };
          void upsertWork(work);
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor, documentsRef]);

  // ===== 卸载时保存 =====
  useEffect(() => {
    return () => {
      if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
      if (dirtyRef.current && editor) {
        const title = titleRef.current?.value || "";
        const html = editor.getHTML();
        const plainText = editor.getText();
        if (title || plainText) {
          const savedAt = Date.now();
          const id = workIdRef.current ?? generateId();
          workIdRef.current = id;
          const work: WorkData = {
            id,
            title,
            html,
            plainText,
            savedAt,
            completedAt: savedAt,
            documents: documentsRef?.current,
          };
          void upsertWork(work);
        }
      }
    };
  }, [editor, documentsRef]);

  // ===== overflow 点击外部关闭 =====
  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflow]);

  // ===== 标题变化 =====
  const handleTitleChange = useCallback(() => {
    if (!writingStartedRef.current) {
      writingStartedRef.current = true;
      trackEvent("writing_started", {});
    }
    setDirty(true);
    dirtyRef.current = true;
    setSaveError(false);
  }, []);

  // ===== 插入章节 =====
  const insertChapter = useCallback(() => {
    if (!editor) return;
    const existing = editor.view.dom.querySelectorAll("h2").length;
    const chapterNum = existing + 2;
    const chineseNum = ["二", "三", "四", "五", "六", "七", "八", "九", "十"][chapterNum - 2] || String(chapterNum);
    const chapterTitle = `第${chineseNum}章`;
    editor.chain().focus().insertContent(`<h2>${chapterTitle}</h2><p></p>`).run();
    setShowOverflow(false);
  }, [editor]);

  // ===== 插入分隔线 =====
  const insertDivider = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().setHorizontalRule().run();
    setShowOverflow(false);
  }, [editor]);

  // ===== 专注模式切换 =====
  const toggleFocusMode = useCallback(() => {
    const next = !focusMode;
    setFocusMode(next);
    onFocusModeChangeRef.current?.(next);
    try {
      localStorage.setItem(FOCUS_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    trackEvent("write_focus_mode_toggled", { enabled: next });
  }, [focusMode, FOCUS_KEY]);

  // ===== 字号缩放 =====
  const changeFontScale = useCallback((delta: number) => {
    setFontScale((prev) => {
      const idx = FONT_SCALES.indexOf(prev);
      const nextIdx = Math.max(0, Math.min(FONT_SCALES.length - 1, idx + delta));
      const next = FONT_SCALES[nextIdx];
      try {
        localStorage.setItem(FONT_SCALE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [FONT_SCALE_KEY]);

  // fontScale 变化时同步到 Tiptap editor
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class:
            "write-editor min-h-[55vh] flex-1 font-serif leading-[1.9] text-text outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-accent [&_h2]:pb-1 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_hr]:my-4 [&_hr]:border-none [&_p]:my-1.5",
          style: `font-size: ${fontScale}px`,
        },
      },
    });
  }, [editor, fontScale]);

  // ⌘+ / ⌘- 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        changeFontScale(1);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        changeFontScale(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changeFontScale]);

  const readingTime = estimateReadingTime(wordCount);

  if (!mounted || !editor) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-text-muted">加载编辑器…</div>
      </div>
    );
  }

  return (
    <div className={focusMode ? "fixed inset-0 z-50 flex flex-col bg-bg" : "flex flex-1 flex-col overflow-hidden"}>
      {/* 顶部状态栏 */}
      <div className="no-print flex items-center justify-between border-b border-accent bg-bg px-5 py-2.5 backdrop-blur">
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
          {/* 字号缩放控件 */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => changeFontScale(-1)}
              disabled={fontScale === FONT_SCALES[0]}
              title="缩小字号 (⌘-)"
              className="flex h-6 w-6 items-center justify-center rounded-sm text-xs text-text-muted transition-colors hover:bg-bg-soft hover:text-text disabled:opacity-30"
            >
              A⁻
            </button>
            <span className="font-mono text-[10px] text-text-muted/60">
              {fontScale}px
            </span>
            <button
              type="button"
              onClick={() => changeFontScale(1)}
              disabled={fontScale === FONT_SCALES[FONT_SCALES.length - 1]}
              title="放大字号 (⌘+)"
              className="flex h-6 w-6 items-center justify-center rounded-sm text-xs text-text-muted transition-colors hover:bg-bg-soft hover:text-text disabled:opacity-30"
            >
              A⁺
            </button>
          </div>
          <div className="mx-1 h-4 w-px bg-text/20" />
          <button
            type="button"
            onClick={toggleFocusMode}
            className="rounded-sm border border-text px-3 py-1 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary"
          >
            {focusMode ? "退出专注" : "专注模式"}
          </button>
        </div>
      </div>

      {/* 精简工具栏（A2：4 核心 + 更多 overflow） */}
      {!focusMode && (
        <div className="no-print flex items-center gap-1 border-b border-accent bg-bg-alt px-5 py-1.5">
          {/* 4 核心按钮 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="加粗"
            shortcut="⌘B"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="斜体"
            shortcut="⌘I"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            label="引用"
          >
            <span className="font-serif">&ldquo;</span>
          </ToolbarButton>
          <ToolbarButton onClick={insertChapter} label="插入章节">
            <span className="text-xs">章</span>
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-text/20" />

          {/* 更多 overflow 下拉 */}
          <div ref={overflowRef} className="relative">
            <ToolbarButton
              onClick={() => setShowOverflow((v) => !v)}
              active={showOverflow}
              label="更多"
            >
              <span className="text-xs">⋯</span>
            </ToolbarButton>
            {showOverflow && (
              <div className="absolute left-0 top-full z-20 mt-1 flex items-center gap-1 rounded-sm border border-text/[0.06] bg-surface px-1.5 py-1 shadow-card">
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().toggleStrike().run();
                    setShowOverflow(false);
                  }}
                  active={editor.isActive("strike")}
                  label="删除线"
                >
                  <span className="line-through">S</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().undo().run();
                    setShowOverflow(false);
                  }}
                  disabled={!editor.can().undo()}
                  label="撤销"
                  shortcut="⌘Z"
                >
                  <span className="text-xs">↶</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().redo().run();
                    setShowOverflow(false);
                  }}
                  disabled={!editor.can().redo()}
                  label="重做"
                  shortcut="⇧⌘Z"
                >
                  <span className="text-xs">↷</span>
                </ToolbarButton>
                <div className="mx-0.5 h-4 w-px bg-text/20" />
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().toggleBulletList().run();
                    setShowOverflow(false);
                  }}
                  active={editor.isActive("bulletList")}
                  label="项目列表"
                >
                  <span className="text-xs">•≡</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().toggleOrderedList().run();
                    setShowOverflow(false);
                  }}
                  active={editor.isActive("orderedList")}
                  label="编号列表"
                >
                  <span className="text-[10px]">1≡</span>
                </ToolbarButton>
                <ToolbarButton onClick={insertDivider} label="分隔线">
                  <span className="text-xs">—</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    editor.chain().focus().unsetAllMarks().clearNodes().run();
                    setShowOverflow(false);
                  }}
                  label="清除格式"
                >
                  <span className="text-[10px]">Tx</span>
                </ToolbarButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 可滚动内容区：标题 + 编辑区 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 pt-8">
          <input
            ref={titleRef}
            type="text"
            defaultValue={initialTitle ?? ""}
            placeholder="为新作品起个标题…"
            onBlur={() => {
              if (dirtyRef.current) void saveFnRef.current();
            }}
            onChange={handleTitleChange}
            className="w-full border-none bg-transparent font-serif text-3xl font-semibold text-text outline-none placeholder:text-text-muted"
          />
        </div>

        {/* 编辑区 */}
        <div className="mx-auto max-w-4xl px-6 py-6">
          <EditorContent editor={editor} className="flex-1" />
        </div>
      </div>

      {/* ProseMirror 样式 */}
      <style>{`
        .write-editor p.is-editor-empty:first-child:before {
          content: attr(data-placeholder);
          color: rgba(28, 28, 30, 0.25);
          pointer-events: none;
          float: left;
          height: 0;
          font-size: 1em;
          font-family: "Noto Serif SC", serif;
          margin-left: 0;
          width: auto;
          text-align: left;
          padding-top: 0;
          vertical-align: baseline;
        }
        .write-editor hr:before {
          content: '* * *';
          color: rgba(107, 102, 94, 0.6);
          text-align: center;
          display: block;
        }
        .ProseMirror:focus { outline: none; }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  onClick,
  children,
  label,
  shortcut,
  active,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`flex h-7 w-7 items-center justify-center rounded-sm text-sm transition-colors hover:bg-accent/[0.05] disabled:opacity-30 ${
        active ? "bg-accent/[0.08] text-text" : "text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
