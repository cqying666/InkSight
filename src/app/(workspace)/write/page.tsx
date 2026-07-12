"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Editor } from "@/components/write/Editor";
import { OutlinePanel } from "@/components/write/OutlinePanel";
import { StageGate } from "@/components/write/StageGate";
import { NewcomerGuide } from "@/components/write/NewcomerGuide";
import { StuckDetectionBubble } from "@/components/write/StuckDetectionBubble";
import { AICoachPanel } from "@/components/write/AICoachPanel";
import type { WriteOutline } from "@/lib/write/outline";
import { loadOutline } from "@/lib/write/outline";
import {
  EMPTY_WORKSPACE_DOCUMENTS,
  outlineToCoachText,
  saveWorkspaceDocuments,
  type WorkspaceDocumentKey,
  type WorkspaceDocuments,
} from "@/lib/write/documents";
import type { CoachContext } from "@/lib/write/coach-context";
import { splitParagraphs } from "@/lib/report/session";
import { loadAllMaterials } from "@/lib/material/catalog";
import { materialToCoachText } from "@/lib/material/from-analysis";
import type { Material } from "@/lib/material";
import { WorkspaceDocumentEditor } from "@/components/write/WorkspaceDocumentEditor";
import { trackEvent } from "@/lib/report/analytics";
import { useUserProfile } from "@/lib/report/use-user-profile";
import { createPortal } from "react-dom";

// MaterialSidebar 含 TF-IDF 索引构建（buildIndex），是 /write 最重的部分
const MaterialSidebar = dynamic(
  () =>
    import("@/components/write/MaterialSidebar").then((m) => m.MaterialSidebar),
  { ssr: false }
);

/**
 * 创作工作台页
 *
 * 布局：全局导航 + 工作台导航 + 双栏（左参考 + 右正文） + 素材抽屉
 *
 * 左栏（参考区）：对标文 / 大纲 / 细纲 / 人物小传（不含正文）
 * 右栏（正文编辑器）：始终常驻，可缩放字号
 * 分隔条：磁吸 3 档（320 / 420 / 520px），双击复位
 *
 * 快捷键：
 * - /：在空行唤出 AI 教练浮窗
 * - Cmd+.：深度专注模式
 * - Alt+←/→：切换分栏档位
 */

type ViewKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

const REF_NAV_ITEMS: { key: ViewKey; label: string; icon: string }[] = [
  { key: "benchmark", label: "对标文", icon: "对" },
  { key: "outline", label: "大纲", icon: "纲" },
  { key: "synopsis", label: "细纲", icon: "细" },
  { key: "characters", label: "人物小传", icon: "人" },
];

// 磁吸档位（左栏宽度 px）
const SNAP_WIDTHS = [320, 420, 520];
const DEFAULT_WIDTH = 420;
const SNAP_THRESHOLD = 24;
const SPLIT_STORAGE_KEY = "inksight:write:split-width";

// A5：根据用户阶段判断视图推荐状态
function getStageViewHint(
  view: ViewKey,
  stage: "newcomer" | "learner" | "creator" | "looped"
): { recommended: boolean; dimmed: boolean; hint: string } {
  if (stage === "newcomer") {
    if (view === "outline") return { recommended: true, dimmed: false, hint: "" };
    return { recommended: false, dimmed: false, hint: "" };
  }
  if (stage === "learner") {
    if (view === "outline") return { recommended: true, dimmed: false, hint: "" };
    return { recommended: false, dimmed: false, hint: "" };
  }
  return { recommended: false, dimmed: false, hint: "" };
}

// 空白态配置
const EMPTY_STATES: Record<
  Exclude<ViewKey, "draft">,
  { caption: string; aphorism: string; actionLabel: string }
> = {
  benchmark: {
    caption: "NO BENCHMARK YET",
    aphorism: "先读百篇，再落一笔。",
    actionLabel: "上传拆文生成对标文",
  },
  outline: {
    caption: "NO OUTLINE YET",
    aphorism: "骨架未立，故事无依。",
    actionLabel: "创建大纲",
  },
  synopsis: {
    caption: "NO SYNOPSIS YET",
    aphorism: "分章而行，方知节奏。",
    actionLabel: "开始写细纲",
  },
  characters: {
    caption: "NO CHARACTERS YET",
    aphorism: "人物有来处，故事才有根。",
    actionLabel: "记录人物",
  },
};

export default function WritePage() {
  const router = useRouter();
  const profile = useUserProfile();
  const stage = profile?.stage ?? "newcomer";

  const [outline, setOutline] = useState<WriteOutline | null>(null);
  const [wordCount, setWordCount] = useState(0);
  // P0-2：默认视图由初始化 effect 设置（智能判断拆文/大纲）
  const [activeView, setActiveView] = useState<ViewKey>("outline");
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
  const materialsRef = useRef<Material[]>([]);

  // P0-3：分栏宽度状态
  const [splitWidth, setSplitWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // 加载持久化的分栏宽度
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (SNAP_WIDTHS.includes(w)) setSplitWidth(w);
      }
    } catch {
      // ignore
    }
  }, []);

  // P0-2：新建作品默认全部空白
  useEffect(() => {
    setMounted(true);
    trackEvent("write_entered", {});
    let cancelled = false;
    (async () => {
      // 新建作品：对标文/大纲/细纲/人物小传全部为空
      setDocuments(EMPTY_WORKSPACE_DOCUMENTS);
      documentsRef.current = EMPTY_WORKSPACE_DOCUMENTS;
      const storedOutline = await loadOutline();
      if (cancelled) return;
      setOutline(storedOutline);
      // 默认显示大纲视图（引导先搭骨架）
      setActiveView("outline");
    })();
    loadAllMaterials().then((mats) => {
      if (!cancelled) materialsRef.current = mats;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 快捷键：Cmd+K 唤出 AI / Cmd+. 深度专注 / Alt+←/→ 切换分栏
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
      // Alt+←/→ 切换分栏档位
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        setSplitWidth((prev) => {
          const idx = SNAP_WIDTHS.indexOf(prev);
          const nextIdx =
            e.key === "ArrowLeft"
              ? Math.max(0, idx - 1)
              : Math.min(SNAP_WIDTHS.length - 1, idx + 1);
          const next = SNAP_WIDTHS[nextIdx];
          try {
            localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // P0-3：拖拽分隔条逻辑
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startWidth: splitWidth };
  }, [splitWidth]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const raw = dragRef.current.startWidth + delta;
      // 临时宽度（不磁吸，实时跟随）
      const clamped = Math.max(SNAP_WIDTHS[0], Math.min(SNAP_WIDTHS[SNAP_WIDTHS.length - 1], raw));
      setSplitWidth(clamped);
    };
    const handleUp = () => {
      setIsDragging(false);
      // 松手磁吸到最近档位
      setSplitWidth((prev) => {
        const snapped = SNAP_WIDTHS.reduce((closest, target) =>
          Math.abs(target - prev) < Math.abs(closest - prev) ? target : closest
        );
        if (Math.abs(snapped - prev) <= SNAP_THRESHOLD || SNAP_WIDTHS.includes(prev)) {
          try {
            localStorage.setItem(SPLIT_STORAGE_KEY, String(snapped));
          } catch {
            // ignore
          }
          return snapped;
        }
        // 超出阈值也吸附到最近
        try {
          localStorage.setItem(SPLIT_STORAGE_KEY, String(snapped));
        } catch {
          // ignore
        }
        return snapped;
      });
      dragRef.current = null;
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  // 双击分隔条复位
  const handleDoubleClick = useCallback(() => {
    setSplitWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(DEFAULT_WIDTH));
    } catch {
      // ignore
    }
  }, []);

  // 获取编辑器内容（供写后分析）
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

  const handleAnalyze = useCallback(() => {
    const html = getEditorHtml();
    const title = getTitle();
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || "";
    if (text.trim().length < 100) return;
    const paragraphs = splitParagraphs(text);
    sessionStorage.setItem(
      "inksight:pending",
      JSON.stringify({ text, paragraphs, title })
    );
    router.push("/analyzing");
  }, [getEditorHtml, getTitle, router]);

  // 获取创作上下文（供 AI 教练）
  const getCoachContext = useCallback((): CoachContext => {
    const editorEl = document.querySelector(
      ".write-editor"
    ) as HTMLDivElement | null;
    const draftText = editorEl?.innerText || "";
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
    materialsRef.current
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
      void saveWorkspaceDocuments(next);
      return true;
    },
    []
  );

  const handleExpandMaterial = useCallback(() => {
    if (!materialMounted) setMaterialMounted(true);
    setMaterialExpanded((v) => !v);
  }, [materialMounted]);

  // 判断左栏某文档是否有内容
  const hasContent = useCallback(
    (view: ViewKey): boolean => {
      if (view === "outline") return !!outline;
      if (view === "benchmark") return !!documents.benchmark.trim();
      if (view === "synopsis") return !!documents.synopsis.trim();
      if (view === "characters") return !!documents.characters.trim();
      return false;
    },
    [outline, documents]
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* ===== 顶部细栏（深度专注时隐藏） ===== */}
      {!deepFocus && (
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-5">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-base font-semibold text-text">
              新建作品
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {wordCount > 0 ? `${wordCount} 字` : "未开始"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="rounded-sm border border-text/[0.06] bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              /
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
            <button
              onClick={() => setShowRightDrawer(true)}
              className="rounded-sm border border-text/[0.06] px-2 py-0.5 font-mono text-[10px] text-text-muted transition-colors hover:text-text lg:hidden"
            >
              素材
            </button>
          </div>
        </header>
      )}

      {/* ===== 主体 ===== */}
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

            {/* P0-1：正文项（= 全宽写作模式，点击收起左栏） */}
            <div className="overflow-y-auto py-2">
              <button
                type="button"
                onClick={() => {
                  setActiveView("draft");
                  trackEvent("write_view_changed", { view: "draft" });
                }}
                title={navCollapsed ? "正文" : undefined}
                className={`flex w-full items-center gap-2.5 px-3 py-2 transition-colors ${
                  activeView === "draft"
                    ? "bg-accent-warm/[0.04] text-text"
                    : "text-text-muted hover:bg-bg-soft/40 hover:text-text"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm font-serif text-[11px] ${
                    activeView === "draft"
                      ? "bg-primary text-text-inverse"
                      : "bg-bg-soft text-text-muted"
                  }`}
                >
                  正
                </span>
                {!navCollapsed && (
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-sans text-[12px] leading-tight">
                      正文
                    </span>
                    <span className="font-mono text-[9px] text-text-muted/50">
                      全宽写作
                    </span>
                  </span>
                )}
                {!navCollapsed && activeView === "draft" && (
                  <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent-warm" />
                )}
              </button>

              {/* P0-1：参考区分隔标识 */}
              {!navCollapsed && (
                <div className="px-3 py-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40">
                    参考
                  </span>
                </div>
              )}
              {navCollapsed && (
                <div className="mx-3 my-1 border-t border-text/[0.06]" />
              )}

              {/* 参考文档导航项 */}
              {REF_NAV_ITEMS.map((item) => {
                const isActive = activeView === item.key;
                const { recommended, dimmed, hint: stageHint } = getStageViewHint(item.key, stage);
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
                        : dimmed
                          ? "text-text-muted/40 hover:bg-bg-soft/30 hover:text-text-muted/70"
                          : "text-text-muted hover:bg-bg-soft/40 hover:text-text"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm font-serif text-[11px] ${
                        isActive
                          ? "bg-primary text-text-inverse"
                          : recommended
                            ? "border border-accent-warm text-accent-warm"
                            : dimmed
                              ? "bg-bg-soft/50 text-text-muted/40"
                              : "bg-bg-soft text-text-muted"
                      }`}
                    >
                      {item.icon}
                    </span>
                    {!navCollapsed && (
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1.5">
                          <span className="font-sans text-[12px] leading-tight">
                            {item.label}
                          </span>
                          {recommended && (
                            <span className="rounded-full bg-accent-warm/10 px-1.5 py-px font-mono text-[8px] text-accent-warm">
                              推荐
                            </span>
                          )}
                        </span>
                        {stageHint && (
                          <span className="font-mono text-[9px] text-text-muted/50">
                            {stageHint}
                          </span>
                        )}
                      </span>
                    )}
                    {!navCollapsed && isActive && (
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent-warm" />
                    )}
                  </button>
                );
              })}
            </div>

            {!navCollapsed && (
              <div className="flex-shrink-0 border-t border-text/[0.06] px-3 py-2">
                <div className="font-mono text-[9px] text-text-muted/50">
                  文档导航
                </div>
              </div>
            )}
          </nav>
        )}

        {/* --- 中栏：双栏（左参考 + 右正文 + 磁吸分隔条） --- */}
        <div className="relative flex min-w-0 flex-1">
          {/* 左栏：参考区（activeView === "draft" 时隐藏 = 全宽写作模式） */}
          {activeView !== "draft" && !deepFocus && (
            <>
              <section
                className="flex flex-shrink-0 flex-col overflow-hidden border-r border-text/[0.08] bg-surface-sunken"
                style={{ width: `${splitWidth}px` }}
              >
                {/* 参考区头部 */}
                <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
                      参考
                    </span>
                    <span className="font-serif text-sm font-semibold text-text">
                      {REF_NAV_ITEMS.find((i) => i.key === activeView)?.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("draft")}
                    className="font-mono text-[10px] text-text-muted transition-colors hover:text-text"
                    title="收起参考（全宽写作）"
                  >
                    ✕
                  </button>
                </div>

                {/* 参考区内容 / 空白态 */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {activeView === "benchmark" &&
                    (hasContent("benchmark") ? (
                      <WorkspaceDocumentEditor
                        title="对标文"
                        eyebrow="Benchmark"
                        value={documents.benchmark}
                        placeholder="上传拆文后，原文会自动同步到这里。也可以粘贴新的对标文，并随时编辑批注。"
                        onChange={(value) => updateDocument("benchmark", value)}
                      />
                    ) : (
                      <EmptyState {...EMPTY_STATES.benchmark} />
                    ))}

                  {activeView === "outline" &&
                    (outline ? (
                      <div className="px-6 py-6">
                        <OutlinePanel onOutlineChange={setOutline} />
                      </div>
                    ) : (
                      <EmptyState
                        {...EMPTY_STATES.outline}
                        onAction={() => setActiveView("outline")}
                      />
                    ))}

                  {activeView === "synopsis" &&
                    (hasContent("synopsis") ? (
                      <WorkspaceDocumentEditor
                        title="细纲"
                        eyebrow="Detailed outline"
                        value={documents.synopsis}
                        placeholder="按章节写下事件推进、情绪变化、卡点与反转。"
                        onChange={(value) => updateDocument("synopsis", value)}
                      />
                    ) : (
                      <EmptyState {...EMPTY_STATES.synopsis} />
                    ))}

                  {activeView === "characters" &&
                    (hasContent("characters") ? (
                      <WorkspaceDocumentEditor
                        title="人物小传"
                        eyebrow="Character bible"
                        value={documents.characters}
                        placeholder="记录人物的来处、欲望、恐惧、关系、转折与最终变化。"
                        onChange={(value) => updateDocument("characters", value)}
                      />
                    ) : (
                      <EmptyState {...EMPTY_STATES.characters} />
                    ))}
                </div>
              </section>

              {/* P0-3：磁吸拖拽分隔条 */}
              <div
                className="group relative flex-shrink-0 cursor-col-resize"
                onMouseDown={handleDragStart}
                onDoubleClick={handleDoubleClick}
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={splitWidth}
                aria-valuemin={SNAP_WIDTHS[0]}
                aria-valuemax={SNAP_WIDTHS[SNAP_WIDTHS.length - 1]}
                title="拖拽调整宽度（双击复位）"
              >
                {/* 8px 透明命中带 */}
                <div className="absolute inset-y-0 -left-1 z-10 w-2" />
                {/* 1px 分隔线 */}
                <div className="h-full w-px bg-text/[0.08] transition-colors group-hover:bg-accent-warm/40" />
                {/* hover 显形把手 */}
                <div className="absolute top-1/2 left-1/2 z-10 h-7 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-warm/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              </div>
            </>
          )}

          {/* 右栏：正文编辑器（始终常驻） */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            <Editor
              onFocusModeChange={setDeepFocus}
              onWordCountChange={setWordCount}
              outline={outline}
              onOpenCoach={() => setShowAIOverlay(true)}
            />
            {/* A6：新手引导浮层 */}
            {stage === "newcomer" && (
              <NewcomerGuide onNavigate={(v) => setActiveView(v)} />
            )}
            {/* A4：底部阶段闸门 */}
            {!deepFocus && (
              <StageGate
                wordCount={wordCount}
                hasOutline={!!outline}
                onAnalyze={handleAnalyze}
              />
            )}
          </div>
        </div>

        {/* --- 右栏：素材库抽屉 --- */}
        {!deepFocus && (
          <aside
            className={`hidden flex-shrink-0 flex-col border-l border-text/[0.06] transition-[width] duration-200 lg:flex ${
              materialExpanded ? "lg:w-[280px]" : "w-8"
            }`}
          >
            {materialExpanded ? (
              <>
                <button
                  type="button"
                  onClick={() => setMaterialExpanded(false)}
                  className="flex h-8 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-3 transition-colors hover:bg-bg-soft/40"
                >
                  <span className="font-mono text-[10px] text-text-muted">
                    素材库
                  </span>
                  <span className="font-mono text-[10px] text-text-muted/50">
                    ▸ 收起
                  </span>
                </button>
                {materialMounted ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
                    <MaterialSidebar outline={outline} />
                  </div>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={handleExpandMaterial}
                className="group flex h-full w-full flex-col items-center gap-2 pt-3 transition-colors hover:bg-bg-soft/40"
                title="展开素材库"
              >
                <span className="font-mono text-[10px] text-text-muted transition-colors group-hover:text-accent-warm"
                  style={{ writingMode: "vertical-rl" }}
                >
                  素材
                </span>
                <span className="font-mono text-[10px] text-text-muted/50">
                  ◂
                </span>
              </button>
            )}
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

      {/* ===== A8：卡住检测气泡 ===== */}
      <StuckDetectionBubble
        wordCount={wordCount}
        isActive={!deepFocus}
        onOpenCoach={() => setShowAIOverlay(true)}
      />

      {/* ===== 中小屏素材抽屉 ===== */}
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
                素材库
              </span>
              <button
                onClick={() => setShowRightDrawer(false)}
                className="font-mono text-[10px] text-text-muted hover:text-text"
              >
                ✕ 关闭
              </button>
            </div>
            <div className="h-[calc(100%-36px)] overflow-y-auto">
              <MaterialSidebar outline={outline} />
            </div>
          </div>
        </div>
      )}

      {/* ===== AI 教练 Portal Overlay ===== */}
      {showAIOverlay && mounted && (
        <AICoachOverlay onClose={() => setShowAIOverlay(false)} getContext={getCoachContext} />
      )}
    </main>
  );
}

// ===== 空白态组件（文学杂志式） =====
function EmptyState({
  caption,
  aphorism,
  actionLabel,
  onAction,
}: {
  caption: string;
  aphorism: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      {/* 编辑性短分隔线 */}
      <div className="w-8 border-t border-text/[0.10]" />
      {/* mono caption */}
      <span className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/60">
        {caption}
      </span>
      {/* serif 引言 */}
      <p className="mt-3 font-serif text-sm italic text-text-muted">
        {aphorism}
      </p>
      {/* ghost 按钮 */}
      <button
        type="button"
        onClick={onAction}
        className="mt-6 rounded-full border border-text/[0.10] px-4 py-1.5 font-serif text-xs text-text-muted transition-colors hover:border-accent-warm hover:text-accent-warm"
      >
        {actionLabel}
      </button>
    </div>
  );
}

// ===== AI 教练 Portal Overlay =====
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
