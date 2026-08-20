"use client";

import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Editor } from "@/components/write/Editor";
import { StageGate } from "@/components/write/StageGate";
import { NewcomerGuide } from "@/components/write/NewcomerGuide";
import { StuckDetectionBubble } from "@/components/write/StuckDetectionBubble";
import { AICoachPanel, createWelcomeMessage } from "@/components/write/AICoachPanel";
import {
  GenerationConfirmOverlay,
  type GenerationType,
  type GenerationPendingState,
} from "@/components/write/GenerationConfirmOverlay";
import {
  EMPTY_WORKSPACE_DOCUMENTS,
  type WorkspaceDocumentKey,
  type WorkspaceDocuments,
} from "@/lib/write/documents";
import {
  generateId,
  loadWorks,
  updateWorkDocuments,
  upsertWork,
  type WorkData,
} from "@/lib/write/storage";
import type {
  CoachContext,
  CoachReference,
  PanelKey,
  ChatMessage,
} from "@/lib/write/coach-context";
import {
  branchCoachSession,
  ensureCoachSession,
  loadCoachSession,
  saveCoachSessionMessages,
  type CoachSessionSummary,
} from "@/lib/coach/session-client";
import { buildIndex, search, type SearchResult } from "@/lib/material/search-tfidf";
import { loadAllMaterials } from "@/lib/material/catalog";
import { materialToCoachText } from "@/lib/material/from-analysis";
import type { Material } from "@/lib/material";
import { WorkspaceDocumentEditor } from "@/components/write/WorkspaceDocumentEditor";
import { trackEvent } from "@/lib/report/analytics";
import { useUserProfile } from "@/lib/report/use-user-profile";
import { createPortal } from "react-dom";

/**
 * 创作工作台页
 *
 * 布局：全局导航 + 工作台导航 + 三栏（左参考 + 中正文 + 右AI对话）
 *
 * 左栏（参考区）：对标文 / 大纲 / 细纲 / 人物小传（不含正文）
 * 右栏（正文编辑器）：始终常驻，可缩放字号
 * 分隔条：磁吸 3 档（320 / 420 / 520px），双击复位
 *
 * 快捷键：
 * - 空格：在空编辑器唤出 AI 教练浮窗
 * - Cmd+.：深度专注模式
 * - Alt+←/→：切换分栏档位
 */

type ViewKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

const REF_NAV_ITEMS: { key: ViewKey; label: string; icon: string }[] = [
  { key: "benchmark", label: "对标文", icon: "对" },
  { key: "characters", label: "人物小传", icon: "人" },
  { key: "outline", label: "大纲", icon: "纲" },
  { key: "synopsis", label: "细纲", icon: "细" },
];

// 磁吸档位（左栏宽度 px）
const SNAP_WIDTHS = [320, 420, 520];
const DEFAULT_WIDTH = 420;
const SNAP_THRESHOLD = 24;
const SPLIT_STORAGE_KEY = "inksight:write:split-width";

// AI 教练对话历史本地迁移种子；正式会话保存到用户隔离的 SQLite 会话树。
const COACH_MESSAGES_KEY = "inksight:write:coach-messages";

// 右侧 AI 对话的初始欢迎消息（共享，不随面板切换）
function createInitialChatMessages(): ChatMessage[] {
  return [createWelcomeMessage("draft")];
}

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

export default function WritePage() {
  const router = useRouter();
  const profile = useUserProfile();
  const stage = profile?.stage ?? "newcomer";

  const [wordCount, setWordCount] = useState(0);
  // 默认只显示正文编辑器，参考区收起
  const [activeView, setActiveView] = useState<ViewKey>("draft");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [deepFocus, setDeepFocus] = useState(false);
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  /** AI 浮窗锚点（光标位置），null 时默认底部居中 */
  const [overlayAnchor, setOverlayAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** 编辑区空格唤起的浮窗独立消息历史（与右侧 AI 面板隔离，关闭时清空） */
  const [overlayMessages, setOverlayMessages] = useState<ChatMessage[]>([]);
  /** 浮窗 remount key：每次唤起时递增，确保状态完全重置 */
  const [overlayKey, setOverlayKey] = useState(0);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [documents, setDocuments] = useState<WorkspaceDocuments>(
    EMPTY_WORKSPACE_DOCUMENTS
  );
  const documentsRef = useRef<WorkspaceDocuments>(EMPTY_WORKSPACE_DOCUMENTS);
  const materialsRef = useRef<Material[]>([]);
  // TF-IDF 索引（从 MaterialSidebar 提升到 WritePage，供隐式 RAG 使用）
  const indexRef = useRef<ReturnType<typeof buildIndex> | null>(null);
  // 当前作品 id（编辑模式从 URL 加载，新建模式由 Editor 首次保存后回填）
  const workIdRef = useRef<string | null>(null);
  // 参考文档 debounce 保存定时器
  const docSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // initialWork：undefined=加载中，null=新建模式，WorkData=编辑模式
  const [initialWork, setInitialWork] = useState<WorkData | null | undefined>(
    undefined
  );
  // 生成结果确认浮层（从首页 @技能 跳转过来时展示）
  const [generationPending, setGenerationPending] =
    useState<GenerationPendingState | null>(null);
  // 新建模式下参考文档自动创建作品后，通知 Editor 同步 workIdRef
  const [externalWorkId, setExternalWorkId] = useState<string | null>(null);
  // AI 教练对话历史（共享，不随面板切换）
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return createInitialChatMessages();
    try {
      const stored = localStorage.getItem(COACH_MESSAGES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return createInitialChatMessages();
  });
  const chatMessagesRef = useRef<ChatMessage[]>(chatMessages);
  const [coachSessions, setCoachSessions] = useState<CoachSessionSummary[]>([]);
  const [activeCoachSessionId, setActiveCoachSessionId] = useState<string | null>(null);
  const draftSessionScopeRef = useRef(
    `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );

  // P0-3：分栏宽度状态
  const [splitWidth, setSplitWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const coachWorkId = initialWork?.id ?? externalWorkId ?? draftSessionScopeRef.current;

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  // 为当前作品恢复 Pi Agent 对话主线；首次迁移时使用旧 localStorage 作为只读种子。
  useEffect(() => {
    if (initialWork === undefined) return;
    let cancelled = false;
    void ensureCoachSession(coachWorkId, chatMessagesRef.current)
      .then((payload) => {
        if (cancelled) return;
        setCoachSessions(payload.sessions);
        setActiveCoachSessionId(payload.session.id);
        if (payload.messages.length > 0) {
          setChatMessages(payload.messages);
        } else {
          setChatMessages(createInitialChatMessages());
        }
      })
      .catch(() => {
        // 会话服务暂不可用时保留本地历史，不阻断写作或教练功能。
        if (!cancelled) setActiveCoachSessionId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [coachWorkId, initialWork]);

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

  // P0-2：根据 URL ?id=xxx 决定新建 / 编辑模式
  useEffect(() => {
    setMounted(true);
    trackEvent("write_entered", {});
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (id) {
        // 编辑模式：加载该作品的所有内容
        const works = await loadWorks();
        if (cancelled) return;
        const work = works.find((w) => w.id === id);
        if (!work) {
          // 作品不存在，退化为新建
          workIdRef.current = null;
          setInitialWork(null);
          setDocuments(EMPTY_WORKSPACE_DOCUMENTS);
          documentsRef.current = EMPTY_WORKSPACE_DOCUMENTS;
        } else {
          const docs = work.documents ?? EMPTY_WORKSPACE_DOCUMENTS;
          workIdRef.current = work.id;
          setInitialWork(work);
          setDocuments(docs);
          documentsRef.current = docs;
        }
      } else {
        // 新建模式：对标文/大纲/细纲/人物小传全部为空，清空之前的 AI 对话历史
        workIdRef.current = null;
        setInitialWork(null);
        setDocuments(EMPTY_WORKSPACE_DOCUMENTS);
        documentsRef.current = EMPTY_WORKSPACE_DOCUMENTS;
        const fresh = createInitialChatMessages();
        setChatMessages(fresh);
        try {
          localStorage.setItem(COACH_MESSAGES_KEY, JSON.stringify(fresh));
        } catch {
          // ignore
        }
      }

      // 检查是否从首页 @技能 跳转过来（?generating=guide|outline|detail-outline）
      const genType = params.get("generating") as GenerationType | null;
      if (genType && (genType === "guide" || genType === "outline" || genType === "detail-outline")) {
        let pending: GenerationPendingState | null = null;
        try {
          const stored = sessionStorage.getItem("inksight:generation-pending");
          if (stored) {
            const parsed = JSON.parse(stored) as Partial<GenerationPendingState>;
            if (parsed.type && parsed.data !== undefined) {
              pending = {
                type: parsed.type,
                data: parsed.data ?? null,
                createdAt: parsed.createdAt ?? Date.now(),
              };
            }
          }
        } catch {
          // ignore
        }
        // detail-outline 模式允许 sessionStorage 为空（基于当前作品大纲即时生成）
        if (!pending && genType === "detail-outline") {
          pending = { type: "detail-outline", data: null, createdAt: Date.now() };
        }
        if (pending) setGenerationPending(pending);
      }
    })();
    loadAllMaterials().then((mats) => {
      if (!cancelled) {
        materialsRef.current = mats;
        // 构建 TF-IDF 索引供隐式 RAG 使用
        indexRef.current = buildIndex(mats);
      }
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
        setOverlayAnchor(null);
        setOverlayMessages([]);
        setOverlayKey((k) => k + 1);
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

  const updateDocument = useCallback(
    (key: WorkspaceDocumentKey, value: string) => {
      const next = { ...documentsRef.current, [key]: value };
      documentsRef.current = next;
      setDocuments(next);
      // 编辑模式（已有 workId）：debounce 800ms 保存到作品的 documents 字段
      // 新建模式（无 workId）：参考文档有内容时自动创建作品并回填 id
      const workId = workIdRef.current;
      if (workId) {
        if (docSaveTimerRef.current) clearTimeout(docSaveTimerRef.current);
        docSaveTimerRef.current = setTimeout(() => {
          void updateWorkDocuments(workId, next);
        }, 800);
      } else {
        // 新建模式：任一参考文档有内容就自动创建作品
        const hasContent =
          next.benchmark.trim() ||
          next.outline.trim() ||
          next.synopsis.trim() ||
          next.characters.trim();
        if (hasContent) {
          if (docSaveTimerRef.current) clearTimeout(docSaveTimerRef.current);
          docSaveTimerRef.current = setTimeout(async () => {
            // 再次检查 workId（可能在此期间已被 Editor 创建）
            if (workIdRef.current) {
              void updateWorkDocuments(workIdRef.current, next);
              return;
            }
            // 创建新作品（标题/正文为空，仅保存参考文档）
            const id = generateId();
            const work: WorkData = {
              id,
              title: "",
              html: "",
              plainText: "",
              savedAt: Date.now(),
              documents: next,
            };
            await upsertWork(work);
            workIdRef.current = id;
            setExternalWorkId(id);
          }, 800);
        }
      }
      return true;
    },
    []
  );

  // 获取当前面板的完整文本
  const getPanelContent = useCallback((panel: PanelKey): string => {
    if (panel === "draft") {
      const editorEl = document.querySelector(
        ".write-editor"
      ) as HTMLDivElement | null;
      return editorEl?.innerText || "";
    }
    // 参考面板：从 documents 状态读取
    return documents[panel as WorkspaceDocumentKey] || "";
  }, [documents]);

  // 获取创作上下文（供 AI 教练）—— 半隔离：当前面板内容 + 跨面板文档只读引用
  const getCoachContext = useCallback((): CoachContext => {
    const panelContent = getPanelContent(activeView);

    // 跨面板文档引用（排除当前面板，避免重复）
    const docLabelMap: Record<string, string> = {
      draft: "正文",
      benchmark: "对标文",
      outline: "大纲",
      synopsis: "细纲",
      characters: "人物小传",
    };
    const references: CoachReference[] = [];

    // 添加其他面板文档作为只读引用
    const draftText =
      activeView !== "draft"
        ? (document.querySelector(".write-editor") as HTMLDivElement | null)
            ?.innerText || ""
        : "";
    const otherDocs: Record<string, string> = {
      draft: draftText,
      benchmark: documents.benchmark,
      outline: documents.outline,
      synopsis: documents.synopsis,
      characters: documents.characters,
    };
    for (const [key, content] of Object.entries(otherDocs)) {
      if (key === activeView) continue; // 跳过当前面板（已作为 panelContent）
      if (!content.trim()) continue;
      references.push({
        id: key,
        kind: "document",
        label: docLabelMap[key] || key,
        content,
      });
    }

    // 添加用户素材库中的收藏/手动/拆文素材（供显式勾选）
    materialsRef.current
      .filter(
        (material) =>
          material.favorited ||
          material.source === "manual" ||
          material.source === "teardown"
      )
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
      activePanel: activeView,
      panelContent,
      references,
    };
  }, [documents, getTitle, wordCount, activeView, getPanelContent]);

  // 隐式 RAG：根据用户消息从素材库检索相关素材
  // 先尝试 Zvec 向量语义搜索（服务端），失败降级到 TF-IDF（客户端内存索引）
  const searchMaterials = useCallback(
    async (query: string): Promise<CoachReference[]> => {
      if (!query.trim()) return [];

      // 1. 先尝试 Zvec 向量搜索（服务端，真正的语义检索）
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("/api/materials/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, opts: { topN: 3 } }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            return data.results.map(
              ({ material }: { material: Material }) => ({
                id: `implicit:${material.id}`,
                kind: "material" as const,
                label:
                  material.component?.summary.slice(0, 24) ||
                  material.inspiration?.title.slice(0, 24) ||
                  material.atom?.text.slice(0, 24) ||
                  "素材",
                content: materialToCoachText(material).slice(0, 500),
                implicit: true,
              })
            );
          }
        }
        // 索引未构建或搜索失败，降级到 TF-IDF
      } catch {
        // 网络错误或超时，降级到 TF-IDF
      }

      // 2. TF-IDF 降级（客户端内存索引，关键词匹配）
      if (!indexRef.current) return [];
      const results = search(indexRef.current, query, {
        topN: 3,
        minScore: 0.06,
      });
      return results.map(({ material }: SearchResult) => ({
        id: `implicit:${material.id}`,
        kind: "material" as const,
        label:
          material.component?.summary.slice(0, 24) ||
          material.inspiration?.title.slice(0, 24) ||
          material.atom?.text.slice(0, 24) ||
          "素材",
        content: materialToCoachText(material).slice(0, 500),
        implicit: true,
      }));
    },
    []
  );

  // 更新右侧 AI 对话历史，持久化到 localStorage
  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    setChatMessages(messages);
    chatMessagesRef.current = messages;
    try {
      localStorage.setItem(COACH_MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
    if (activeCoachSessionId) {
      void saveCoachSessionMessages(activeCoachSessionId, messages).catch(() => {
        // 服务端持久化失败时，localStorage 仍保留本地恢复点。
      });
    }
  }, [activeCoachSessionId]);

  const handleCoachSessionChange = useCallback(async (sessionId: string) => {
    try {
      const payload = await loadCoachSession(sessionId);
      setActiveCoachSessionId(payload.session.id);
      const nextMessages = payload.messages.length > 0
        ? payload.messages
        : createInitialChatMessages();
      setChatMessages(nextMessages);
      chatMessagesRef.current = nextMessages;
      trackEvent("coach_session_switched", { session_id: payload.session.id });
    } catch {
      // 切换失败时停留在当前会话。
    }
  }, []);

  const handleCoachBranch = useCallback(async () => {
    if (!activeCoachSessionId) return;
    try {
      const payload = await branchCoachSession(
        activeCoachSessionId,
        chatMessagesRef.current
      );
      setCoachSessions(payload.sessions);
      setActiveCoachSessionId(payload.session.id);
      const nextMessages = payload.messages.length > 0
        ? payload.messages
        : createInitialChatMessages();
      setChatMessages(nextMessages);
      chatMessagesRef.current = nextMessages;
      trackEvent("coach_session_branched", { session_id: payload.session.id });
    } catch {
      // 分支失败时不影响当前会话。
    }
  }, [activeCoachSessionId]);

  // 将教练回复插入到当前面板编辑器（决策 4：对话内预览 → 一键插入）
  const handleInsertText = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      if (activeView === "draft") {
        // 正文：插入到 contentEditable .write-editor
        const editor = document.querySelector(
          ".write-editor"
        ) as HTMLDivElement | null;
        if (!editor) return;
        editor.focus();
        const sel = window.getSelection();
        let inserted = false;
        if (
          sel &&
          sel.rangeCount > 0 &&
          editor.contains(sel.getRangeAt(0).commonAncestorContainer)
        ) {
          inserted = document.execCommand("insertText", false, text);
        } else {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
          inserted = document.execCommand("insertText", false, text);
        }
        if (inserted) {
          window.dispatchEvent(new Event("inksight:editor-change"));
        }
      } else {
        // 参考面板：插入到对应 textarea
        const ta = document.querySelector(
          `textarea[data-panel="${activeView}"]`
        ) as HTMLTextAreaElement | null;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newValue =
          ta.value.slice(0, start) + text + ta.value.slice(end);
        updateDocument(activeView as WorkspaceDocumentKey, newValue);
        // 恢复光标到插入文本之后
        requestAnimationFrame(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + text.length;
        });
      }
      trackEvent("coach_text_inserted", {
        panel: activeView,
        length: text.length,
      });
    },
    [activeView, updateDocument]
  );

  const handleExpandChat = useCallback(() => {
    setChatExpanded(true);
  }, []);

  // Editor 首次保存生成作品 id 后回调：切换为编辑模式，后续参考文档编辑可独立持久化
  const handleWorkIdGenerated = useCallback((id: string) => {
    workIdRef.current = id;
  }, []);

  // 清除 URL 中的 ?generating=xxx 参数（保留 ?id 等其他参数）
  const clearGeneratingParam = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("generating");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // 采纳生成结果：写入到对应位置，清除 sessionStorage 和 URL 参数
  const handleAdoptGeneration = useCallback(
    (payload: {
      type: GenerationType;
      text: string;
      target: "draft" | "outline" | "synopsis";
    }) => {
      const { type, text, target } = payload;
      if (target === "draft") {
        // 导语采纳到正文编辑器：切换到 draft 视图，等下一帧编辑器布局更新后插入文本
        setActiveView("draft");
        requestAnimationFrame(() => {
          const editor = document.querySelector(
            ".write-editor",
          ) as HTMLDivElement | null;
          if (!editor) return;
          editor.focus();
          const sel = window.getSelection();
          let inserted = false;
          if (
            sel &&
            sel.rangeCount > 0 &&
            editor.contains(sel.getRangeAt(0).commonAncestorContainer)
          ) {
            inserted = document.execCommand("insertText", false, text);
          } else {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            inserted = document.execCommand("insertText", false, text);
          }
          if (inserted) {
            window.dispatchEvent(new Event("inksight:editor-change"));
          }
          trackEvent("coach_text_inserted", {
            panel: "draft",
            length: text.length,
          });
        });
      } else {
        // 大纲/细纲采纳到对应参考面板
        updateDocument(target, text);
        setActiveView(target);
      }
      // 清理 sessionStorage 和 URL
      try {
        sessionStorage.removeItem("inksight:generation-pending");
      } catch {
        // ignore
      }
      clearGeneratingParam();
      setGenerationPending(null);
      trackEvent("generation_adopted", { type, target });
    },
    [updateDocument, clearGeneratingParam],
  );

  // 丢弃生成结果：清除 sessionStorage 和 URL 参数
  const handleDiscardGeneration = useCallback(() => {
    try {
      sessionStorage.removeItem("inksight:generation-pending");
    } catch {
      // ignore
    }
    clearGeneratingParam();
    setGenerationPending(null);
    trackEvent("generation_discarded", {});
  }, [clearGeneratingParam]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* ===== 顶部细栏（深度专注时隐藏） ===== */}
      {!deepFocus && (
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-5">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-base font-semibold text-text">
              {initialWork ? "编辑作品" : "新建作品"}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {wordCount > 0 ? `${wordCount} 字` : "未开始"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="rounded-sm border border-text/[0.06] bg-surface px-2 py-0.5 font-mono text-[10px] text-text-muted">
              Space
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
              AI
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

                {/* 参考区内容 */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {activeView === "benchmark" && (
                    <WorkspaceDocumentEditor
                      value={documents.benchmark}
                      placeholder="粘贴对标文，随时编辑批注…"
                      onChange={(value) => updateDocument("benchmark", value)}
                      panelId="benchmark"
                      onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
                    />
                  )}

                  {activeView === "outline" && (
                    <WorkspaceDocumentEditor
                      value={documents.outline}
                      placeholder="按章节创造大纲…"
                      onChange={(value) => updateDocument("outline", value)}
                      panelId="outline"
                      onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
                    />
                  )}

                  {activeView === "synopsis" && (
                    <WorkspaceDocumentEditor
                      value={documents.synopsis}
                      placeholder="按章节写下事件推进、情绪变化、卡点与反转…"
                      onChange={(value) => updateDocument("synopsis", value)}
                      panelId="synopsis"
                      onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
                    />
                  )}

                  {activeView === "characters" && (
                    <WorkspaceDocumentEditor
                      value={documents.characters}
                      placeholder="记录人物的来处、欲望、恐惧、关系、转折与最终变化…"
                      onChange={(value) => updateDocument("characters", value)}
                      panelId="characters"
                      onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
                    />
                  )}
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
            {initialWork === undefined ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-sm text-text-muted">加载作品…</div>
              </div>
            ) : (
              <Editor
                onFocusModeChange={setDeepFocus}
                onWordCountChange={setWordCount}
                onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
                initialWorkId={initialWork?.id}
                initialTitle={initialWork?.title}
                initialHtml={initialWork?.html}
                documentsRef={documentsRef}
                onWorkIdGenerated={handleWorkIdGenerated}
                externalWorkId={externalWorkId}
              />
            )}
            {/* A6：新手引导浮层 */}
            {stage === "newcomer" && (
              <NewcomerGuide onNavigate={(v) => setActiveView(v)} />
            )}
            {/* A4：底部阶段闸门 */}
            {!deepFocus && (
              <StageGate
                wordCount={wordCount}
                hasOutline={!!documents.outline.trim()}
              />
            )}
          </div>
        </div>

        {/* --- 右栏：AI 对话区 --- */}
        {!deepFocus && (
          <aside
            className={`hidden flex-shrink-0 flex-col border-l border-text/[0.06] transition-[width] duration-200 lg:flex ${
              chatExpanded ? "lg:w-[340px]" : "w-8"
            }`}
          >
            {chatExpanded ? (
              <>
                <button
                  type="button"
                  onClick={() => setChatExpanded(false)}
                  className="flex h-8 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-3 transition-colors hover:bg-bg-soft/40"
                >
                  <span className="font-mono text-[10px] text-text-muted">
                    AI 对话
                  </span>
                  <span className="font-mono text-[10px] text-text-muted/50">
                    ▸ 收起
                  </span>
                </button>
                <div className="flex min-h-0 flex-1 flex-col">
                  <AICoachPanel
                    activePanel={activeView}
                    getContext={getCoachContext}
                    searchMaterials={searchMaterials}
                    messages={chatMessages}
                    onMessagesChange={handleMessagesChange}
                    onInsertText={handleInsertText}
                    sessions={coachSessions}
                    activeSessionId={activeCoachSessionId ?? undefined}
                    onSessionChange={handleCoachSessionChange}
                    onBranchSession={handleCoachBranch}
                    agentSessionId={activeCoachSessionId ?? undefined}
                  />
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={handleExpandChat}
                className="group flex h-full w-full flex-col items-center gap-2 pt-3 transition-colors hover:bg-bg-soft/40"
                title="展开 AI 对话"
              >
                <span className="font-mono text-[10px] text-text-muted transition-colors group-hover:text-accent-warm"
                  style={{ writingMode: "vertical-rl" }}
                >
                  AI
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
        onOpenCoach={(anchor) => {
              setOverlayAnchor(anchor ?? null);
              setOverlayMessages([]);
              setOverlayKey((k) => k + 1);
              setShowAIOverlay(true);
            }}
      />

      {/* ===== 中小屏 AI 对话抽屉 ===== */}
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
                AI 对话
              </span>
              <button
                onClick={() => setShowRightDrawer(false)}
                className="font-mono text-[10px] text-text-muted hover:text-text"
              >
                ✕ 关闭
              </button>
            </div>
            <div className="h-[calc(100%-36px)]">
              <AICoachPanel
                activePanel={activeView}
                getContext={getCoachContext}
                searchMaterials={searchMaterials}
                messages={chatMessages}
                onMessagesChange={handleMessagesChange}
                onInsertText={handleInsertText}
                sessions={coachSessions}
                activeSessionId={activeCoachSessionId ?? undefined}
                onSessionChange={handleCoachSessionChange}
                onBranchSession={handleCoachBranch}
                agentSessionId={activeCoachSessionId ?? undefined}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== AI 教练 Portal Overlay（独立消息历史，关闭即清空） ===== */}
      {showAIOverlay && mounted && (
        <AICoachOverlay
          key={overlayKey}
          onClose={() => {
            setOverlayMessages([]);
            setShowAIOverlay(false);
          }}
          activePanel={activeView}
          getContext={getCoachContext}
          searchMaterials={searchMaterials}
          messages={overlayMessages}
          onMessagesChange={setOverlayMessages}
          onInsertText={handleInsertText}
          anchor={overlayAnchor}
        />
      )}

      {/* ===== 生成结果确认浮层（从首页 @技能 跳转过来） ===== */}
      {generationPending && mounted && (
        <GenerationConfirmOverlay
          type={generationPending.type}
          data={generationPending.data}
          currentOutlineText={documents.outline}
          onAdopt={handleAdoptGeneration}
          onDiscard={handleDiscardGeneration}
        />
      )}
    </main>
  );
}

// ===== AI 教练 Portal Overlay =====
function AICoachOverlay({
  onClose,
  activePanel,
  getContext,
  searchMaterials,
  messages,
  onMessagesChange,
  onInsertText,
  anchor,
}: {
  onClose: () => void;
  activePanel: PanelKey;
  getContext: () => CoachContext;
  searchMaterials?: (query: string) => Promise<CoachReference[]>;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  onInsertText?: (text: string) => void;
  anchor?: { top: number; left: number } | null;
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

  // 计算浮层定位：有锚点时跟随光标，否则底部居中
  const overlayWidth = 520;
  const anchorLeft = anchor
    ? Math.min(anchor.left, window.innerWidth - overlayWidth - 16)
    : null;
  const overlayStyle: CSSProperties = anchor
    ? { top: `${anchor.top + 8}px`, left: `${anchorLeft}px`, width: `${overlayWidth}px` }
    : { bottom: "40px", left: "50%", transform: "translateX(-50%)", width: `${overlayWidth}px` };

  return createPortal(
    <>
      {/* 透明遮罩：捕获点击外部关闭，不置灰背景 */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] px-2"
        style={overlayStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <AICoachPanel
          overlay
          onClose={onClose}
          activePanel={activePanel}
          getContext={getContext}
          searchMaterials={searchMaterials}
          messages={messages}
          onMessagesChange={onMessagesChange}
          onInsertText={onInsertText}
        />
      </div>
    </>,
    document.body
  );
}
