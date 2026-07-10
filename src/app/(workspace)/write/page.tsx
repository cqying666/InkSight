"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Editor } from "@/components/write/Editor";
import { OutlinePanel } from "@/components/write/OutlinePanel";
import { WriteAnalysis } from "@/components/write/WriteAnalysis";
import { WriteNextSteps } from "@/components/write/WriteNextSteps";
import { AICoachPanel } from "@/components/write/AICoachPanel";
import type { WriteOutline } from "@/lib/write/outline";
import { trackEvent } from "@/lib/report/analytics";
import { createPortal } from "react-dom";

// MaterialSidebar 含 TF-IDF 索引构建（buildIndex），是 /write 最重的部分
const MaterialSidebar = dynamic(
  () =>
    import("@/components/write/MaterialSidebar").then((m) => m.MaterialSidebar),
  { ssr: false }
);

// AICoachPanel 动态加载，避免首屏加载对话逻辑
const AICoachPanelLazy = dynamic(
  () => import("@/components/write/AICoachPanel").then((m) => m.AICoachPanel),
  { ssr: false }
);

/**
 * 创作工作台页
 *
 * 三栏布局（基于圆桌讨论共识）：
 * - 左栏：复用全局 WorkspaceShell 的 WorkspaceSidebar（进入时折叠为 w-16 图标条）
 * - 工作台内导航：正文 / 对标文 / 大纲 / 细纲 / 人物小传（可折叠为 w-12）
 * - 中栏：编辑器（flex-1，视觉焦点）
 * - 右栏：AI 教练对话（主常驻 60%+） + 素材库折叠抽屉
 *
 * 快捷键：
 * - Cmd+K：唤出 AI 教练浮窗
 * - Cmd+.：深度专注模式（收起工作台导航 + 右栏）
 */

type ViewKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

const NAV_ITEMS: { key: ViewKey; label: string; icon: string; hint: string }[] = [
  { key: "draft", label: "正文", icon: "正", hint: "创作编辑" },
  { key: "benchmark", label: "对标文", icon: "对", hint: "参考作品" },
  { key: "outline", label: "大纲", icon: "纲", hint: "故事骨架" },
  { key: "synopsis", label: "细纲", icon: "细", hint: "分章细纲" },
  { key: "characters", label: "人物小传", icon: "人", hint: "角色档案" },
];

export default function WritePage() {
  const [outline, setOutline] = useState<WriteOutline | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [activeView, setActiveView] = useState<ViewKey>("draft");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [deepFocus, setDeepFocus] = useState(false);
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [materialExpanded, setMaterialExpanded] = useState(false);
  const [materialMounted, setMaterialMounted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showRightDrawer, setShowRightDrawer] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 进入 /write 时自动折叠全局导航
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("inksight:nav-collapsed", "1");
    } catch {
      // ignore
    }
  }, [mounted]);

  // 快捷键：Cmd+K 唤出 AI / Cmd+. 深度专注
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowAIOverlay((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setDeepFocus((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleEnter = () => {
    trackEvent("write_entered", {});
  };

  // 获取编辑器内容（供 WriteAnalysis）
  const getEditorHtml = useCallback(() => {
    const el = document.querySelector(".write-editor") as HTMLDivElement | null;
    return el?.innerHTML || "";
  }, []);

  const getTitle = useCallback(() => {
    const el = document.querySelector(
      'input[placeholder="作品标题…"]'
    ) as HTMLInputElement | null;
    return el?.value || "";
  }, []);

  // 获取创作上下文（供 AI 教练）
  const getCoachContext = useCallback(() => {
    const editorEl = document.querySelector(
      ".write-editor"
    ) as HTMLDivElement | null;
    const excerpt = editorEl?.innerText?.slice(-300) || "";
    return { title: getTitle(), wordCount, excerpt };
  }, [getTitle, wordCount]);

  // 首次展开素材库时 mount
  const handleExpandMaterial = useCallback(() => {
    if (!materialMounted) setMaterialMounted(true);
    setMaterialExpanded((v) => !v);
  }, [materialMounted]);

  return (
    <main
      className="flex h-screen flex-col overflow-hidden bg-bg"
      onMouseEnter={handleEnter}
    >
      {/* ===== 顶部细栏（深度专注时隐藏） ===== */}
      {!deepFocus && (
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-5">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-base font-semibold text-text">
              创作工作台
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {wordCount > 0 ? `${wordCount} 字` : "未开始"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="rounded-sm border border-text/[0.06] bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              ⌘K
            </kbd>
            <span className="hidden font-mono text-[10px] text-text-muted sm:inline">
              唤出教练
            </span>
            <kbd className="rounded-sm border border-text/[0.06] bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              ⌘.
            </kbd>
            <span className="hidden font-mono text-[10px] text-text-muted sm:inline">
              深度专注
            </span>
            {/* 中小屏右侧抽屉唤出 */}
            <button
              onClick={() => setShowRightDrawer(true)}
              className="rounded-sm border border-text/[0.06] px-2 py-0.5 font-mono text-[10px] text-text-muted transition-colors hover:text-text lg:hidden"
            >
              工具栏
            </button>
          </div>
        </header>
      )}

      {/* ===== 主体：工作台导航 + 编辑器 + 右栏 ===== */}
      <div className="flex min-h-0 flex-1">
        {/* --- 工作台内导航栏（深度专注时隐藏） --- */}
        {!deepFocus && (
          <nav
            className={`flex flex-shrink-0 flex-col border-r border-text/[0.06] transition-[width] duration-200 ${
              navCollapsed ? "w-12" : "w-48"
            }`}
          >
            {/* 折叠按钮 */}
            <button
              type="button"
              onClick={() => setNavCollapsed((v) => !v)}
              className="flex h-9 flex-shrink-0 items-center justify-center border-b border-text/[0.06] text-text-muted transition-colors hover:bg-bg-soft/40"
              title={navCollapsed ? "展开导航" : "收起导航"}
            >
              <span className="font-mono text-[10px]">
                {navCollapsed ? "▸" : "◂"}
              </span>
            </button>

            {/* 导航项 */}
            <div className="flex-1 overflow-y-auto py-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveView(item.key);
                      trackEvent("write_view_changed", { view: item.key });
                    }}
                    title={navCollapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 transition-colors ${
                      isActive
                        ? "bg-accent-warm/[0.04] text-text"
                        : "text-text-muted hover:bg-bg-soft/40 hover:text-text"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm font-serif text-[11px] ${
                        isActive
                          ? "bg-primary text-text-inverse"
                          : "bg-bg-soft text-text-muted"
                      }`}
                    >
                      {item.icon}
                    </span>
                    {!navCollapsed && (
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-sans text-[12px] leading-tight">
                          {item.label}
                        </span>
                        <span className="font-mono text-[9px] text-text-muted/50">
                          {item.hint}
                        </span>
                      </span>
                    )}
                    {!navCollapsed && isActive && (
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent-warm" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 底部状态 */}
            {!navCollapsed && (
              <div className="flex-shrink-0 border-t border-text/[0.06] px-3 py-2">
                <div className="font-mono text-[9px] text-text-muted/50">
                  文档导航
                </div>
              </div>
            )}
          </nav>
        )}

        {/* --- 中栏：编辑器/文档区 --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {activeView === "draft" && (
            <Editor
              onFocusModeChange={setDeepFocus}
              onWordCountChange={setWordCount}
              outline={outline}
            />
          )}

          {activeView === "benchmark" && (
            <BenchmarkView outline={outline} />
          )}

          {activeView === "outline" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <OutlinePanel onOutlineChange={setOutline} />
              </div>
            </div>
          )}

          {activeView === "synopsis" && (
            <SynopsisView outline={outline} />
          )}

          {activeView === "characters" && (
            <CharactersView outline={outline} />
          )}

          {/* 底部操作区（深度专注时隐藏） */}
          {!deepFocus && activeView === "draft" && (
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-text/[0.06] px-5 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <WriteAnalysis getEditorHtml={getEditorHtml} getTitle={getTitle} />
              </div>
              <span className="flex-shrink-0 font-mono text-[10px] text-text-muted">
                {wordCount} 字 · 约 {Math.max(1, Math.ceil(wordCount / 300))} 分钟
              </span>
            </div>
          )}
        </div>

        {/* --- 右栏：AI 对话 + 素材抽屉（深度专注时隐藏） --- */}
        {!deepFocus && (
          <aside className="hidden flex-shrink-0 flex-col border-l border-text/[0.06] lg:flex lg:w-[280px]">
            {/* AI 对话区（主常驻，占 60%+） */}
            <div className="flex min-h-[50vh] flex-1 flex-col">
              <AICoachPanelLazy getContext={getCoachContext} />
            </div>

            {/* 素材库抽屉（折叠态 32px 把手 / 展开态 40%） */}
            <div
              className="flex-shrink-0 border-t border-text/[0.06] transition-all duration-200"
              style={{ height: materialExpanded ? "40%" : "32px" }}
            >
              {/* 把手 */}
              <button
                type="button"
                onClick={handleExpandMaterial}
                className="flex h-8 w-full items-center justify-between px-3 transition-colors hover:bg-bg-soft/40"
              >
                <span className="font-mono text-[10px] text-text-muted">
                  素材库
                </span>
                <span className="font-mono text-[10px] text-text-muted/50">
                  {materialExpanded ? "▾ 收起" : "▸ 展开"}
                </span>
              </button>

              {/* 素材内容（首次展开才 mount，之后 hidden 保缓存） */}
              {materialMounted && (
                <div
                  className={`h-[calc(100%-32px)] overflow-y-auto px-3 pb-3 ${
                    materialExpanded ? "block" : "hidden"
                  }`}
                >
                  <MaterialSidebar outline={outline} />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ===== 深度专注提示 ===== */}
      {deepFocus && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-text/[0.06] bg-surface/95 px-4 py-1.5 shadow-sm backdrop-blur-sm">
            <span className="font-mono text-[10px] text-text-muted">
              深度专注
            </span>
            <span className="font-mono text-[10px] text-text-muted/40">|</span>
            <kbd className="font-mono text-[10px] text-text-muted">⌘.</kbd>
            <span className="font-mono text-[10px] text-text-muted">退出</span>
          </div>
        </div>
      )}

      {/* ===== 中小屏右栏抽屉 ===== */}
      {showRightDrawer && (
        <div
          className="fixed inset-0 z-50 bg-text/30 lg:hidden"
          onClick={() => setShowRightDrawer(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-80 max-w-[85vw] overflow-hidden bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-3">
              <span className="font-serif text-sm font-semibold text-text">
                AI 教练 / 素材
              </span>
              <button
                onClick={() => setShowRightDrawer(false)}
                className="font-mono text-[10px] text-text-muted hover:text-text"
              >
                ✕ 关闭
              </button>
            </div>
            <div className="flex h-[calc(100%-36px)] flex-col">
              <div className="flex-1 overflow-hidden">
                <AICoachPanelLazy getContext={getCoachContext} />
              </div>
              <div className="flex-shrink-0 border-t border-text/[0.06]">
                <MaterialSidebar outline={outline} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Cmd+K AI 教练 Portal Overlay ===== */}
      {showAIOverlay && mounted && (
        <AICoachOverlay onClose={() => setShowAIOverlay(false)} getContext={getCoachContext} />
      )}

      {/* ===== 下一步引导 + 评分（深度专注时隐藏） ===== */}
      {!deepFocus && activeView === "draft" && (
        <div className="no-print hidden border-t border-text/[0.06] px-5 py-3 lg:block">
          <WriteNextSteps wordCount={wordCount} hasOutline={!!outline} />
        </div>
      )}
    </main>
  );
}

// ===== Cmd+K AI 教练 Portal Overlay =====
function AICoachOverlay({
  onClose,
  getContext,
}: {
  onClose: () => void;
  getContext: () => {
    title?: string;
    wordCount?: number;
    excerpt?: string;
  };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]" />
      <div
        className="relative flex h-[60vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-text/[0.06] bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <AICoachPanel overlay onClose={onClose} getContext={getContext} />
      </div>
    </div>,
    document.body
  );
}

// ===== 对标文视图 =====
function BenchmarkView({ outline }: { outline: WriteOutline | null }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[680px] px-10 py-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-serif text-title-lg text-text">对标文</h2>
          <span className="font-mono text-[10px] text-text-muted">
            参考作品 · 只读
          </span>
        </div>
        <p className="mb-6 font-mono text-[10px] text-text-muted/60">
          创作时随时切回此页对照节奏与语气。对标文来自拆文分析的上传原文。
        </p>
        <div className="rounded-md border border-text/[0.06] bg-bg-soft p-5">
          <p className="mb-3 font-serif text-sm text-text-muted">
            {outline
              ? "当前对标文为大纲创建时的参考作品。"
              : "尚未创建大纲，暂无对标文。请先在「大纲」页搭建结构。"}
          </p>
          <p className="font-mono text-[10px] text-text-muted/50">
            提示：上传拆文后，原文会自动同步到此页作为对标参考。
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== 细纲视图 =====
function SynopsisView({ outline }: { outline: WriteOutline | null }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[680px] px-10 py-8">
        <h2 className="mb-6 font-serif text-title-lg text-text">细纲</h2>
        {outline ? (
          <div className="space-y-5">
            {outline.reversals.map((rev, i) => (
              <div key={i} className="border-l border-text/[0.06] pl-5">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-text-muted/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-serif text-[15px] font-semibold text-text">
                    反转节点 · {Math.round(rev.position * 100)}%
                  </span>
                </div>
                <p className="mb-1 text-[13px] leading-[1.6] text-text">
                  {rev.note || "（未填写描述）"}
                </p>
                <p className="font-mono text-[10px] text-text-muted/60">
                  类型：{rev.type}
                </p>
              </div>
            ))}
            <div className="border-l border-text/[0.06] pl-5">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-text-muted/40">
                  结局
                </span>
                <span className="font-serif text-[15px] font-semibold text-text">
                  {outline.endingType}
                </span>
              </div>
              <p className="font-mono text-[10px] text-text-muted/60">
                情绪走势：{outline.emotionGoal.trend || "未设定"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-text/[0.06] bg-bg-soft p-5 text-center">
            <p className="font-serif text-sm text-text-muted">
              尚未创建大纲，无法显示细纲。
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-muted/50">
              请先在「大纲」页搭建结构。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 人物小传视图 =====
function CharactersView({ outline }: { outline: WriteOutline | null }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[680px] px-10 py-8">
        <h2 className="mb-6 font-serif text-title-lg text-text">人物小传</h2>
        <div className="rounded-md border border-text/[0.06] bg-bg-soft p-5">
          <p className="font-serif text-sm text-text-muted">
            {outline
              ? "当前大纲已创建，可在此页为每个角色建立小传。"
              : "尚未创建大纲。创建大纲后，可在此页为角色建立详细小传。"}
          </p>
          <p className="mt-2 font-mono text-[10px] text-text-muted/50">
            人物小传功能开发中。目前可通过大纲页记录角色相关信息。
          </p>
        </div>
      </div>
    </div>
  );
}
