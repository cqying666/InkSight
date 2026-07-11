"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Editor } from "@/components/write/Editor";
import { OutlinePanel } from "@/components/write/OutlinePanel";
import { WriteAnalysis } from "@/components/write/WriteAnalysis";
import { WriteNextSteps } from "@/components/write/WriteNextSteps";
import { AICoachPanel } from "@/components/write/AICoachPanel";
import type { WriteOutline } from "@/lib/write/outline";
import { loadOutline } from "@/lib/write/outline";
import {
  EMPTY_WORKSPACE_DOCUMENTS,
  loadWorkspaceDocuments,
  outlineToCoachText,
  saveWorkspaceDocuments,
  seedDocumentsFromAnalysis,
  type WorkspaceDocumentKey,
  type WorkspaceDocuments,
} from "@/lib/write/documents";
import type { CoachContext } from "@/lib/write/coach-context";
import { loadAnalysis } from "@/lib/report/session";
import { loadAllMaterials } from "@/lib/material/catalog";
import { materialToCoachText } from "@/lib/material/from-analysis";
import { loadDraft } from "@/lib/write/storage";
import { WorkspaceDocumentEditor } from "@/components/write/WorkspaceDocumentEditor";
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
  const [documents, setDocuments] = useState<WorkspaceDocuments>(
    EMPTY_WORKSPACE_DOCUMENTS
  );
  const documentsRef = useRef<WorkspaceDocuments>(EMPTY_WORKSPACE_DOCUMENTS);

  useEffect(() => {
    setMounted(true);
    trackEvent("write_entered", {});
    const storedAnalysis = loadAnalysis();
    const storedDocuments = loadWorkspaceDocuments();
    const seeded = seedDocumentsFromAnalysis(
      storedDocuments,
      storedAnalysis?.analysis,
      storedAnalysis?.paragraphs
    );
    setDocuments(seeded);
    documentsRef.current = seeded;
    saveWorkspaceDocuments(seeded);
    setOutline(loadOutline());
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
  const getCoachContext = useCallback((): CoachContext => {
    const editorEl = document.querySelector(
      ".write-editor"
    ) as HTMLDivElement | null;
    const draftText = editorEl?.innerText || loadDraft()?.plainText || "";
    const documentReferences: CoachContext["references"] = [
      { id: "draft", kind: "document", label: "正文", content: draftText },
      { id: "benchmark", kind: "document", label: "对标文", content: documents.benchmark },
      { id: "outline", kind: "document", label: "大纲", content: outlineToCoachText(outline) },
      { id: "synopsis", kind: "document", label: "细纲", content: documents.synopsis },
      { id: "characters", kind: "document", label: "人物小传", content: documents.characters },
    ];
    const references: CoachContext["references"] = documentReferences.filter(
      (item) => item.content.trim()
    );

    loadAllMaterials()
      .filter((material) => material.favorited || material.source === "manual" || material.source === "teardown")
      .forEach((material) => {
        const content = materialToCoachText(material);
        if (!content) return;
        references.push({
          id: `material:${material.id}`,
          kind: "material",
          label:
            material.component?.summary.slice(0, 24) ||
            material.inspiration?.title.slice(0, 24) ||
            material.atom?.text.slice(0, 24) ||
            "素材",
          content,
        });
      });

    return {
      title: getTitle(),
      wordCount,
      references,
    };
  }, [documents, getTitle, outline, wordCount]);

  const updateDocument = useCallback(
    (key: WorkspaceDocumentKey, value: string) => {
      const next = { ...documentsRef.current, [key]: value };
      documentsRef.current = next;
      setDocuments(next);
      return saveWorkspaceDocuments(next);
    },
    []
  );

  // 首次展开素材库时 mount
  const handleExpandMaterial = useCallback(() => {
    if (!materialMounted) setMaterialMounted(true);
    setMaterialExpanded((v) => !v);
  }, [materialMounted]);

  return (
    <main
      className="flex h-screen flex-col overflow-hidden bg-bg"
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
            <WorkspaceDocumentEditor
              title="对标文"
              eyebrow="Benchmark"
              value={documents.benchmark}
              placeholder="上传拆文后，原文会自动同步到这里。也可以粘贴新的对标文，并随时编辑批注。"
              onChange={(value) => updateDocument("benchmark", value)}
            />
          )}

          {activeView === "outline" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <OutlinePanel onOutlineChange={setOutline} />
              </div>
            </div>
          )}

          {activeView === "synopsis" && (
            <WorkspaceDocumentEditor
              title="细纲"
              eyebrow="Detailed outline"
              value={documents.synopsis}
              placeholder="按章节写下事件推进、情绪变化、卡点与反转。"
              onChange={(value) => updateDocument("synopsis", value)}
            />
          )}

          {activeView === "characters" && (
            <WorkspaceDocumentEditor
              title="人物小传"
              eyebrow="Character bible"
              value={documents.characters}
              placeholder="记录人物的来处、欲望、恐惧、关系、转折与最终变化。"
              onChange={(value) => updateDocument("characters", value)}
            />
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
  getContext: () => CoachContext;
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
