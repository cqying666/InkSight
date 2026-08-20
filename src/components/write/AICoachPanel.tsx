"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { trackEvent } from "@/lib/report/analytics";
import type {
  CoachContext,
  CoachReference,
  PanelKey,
  ChatMessage,
} from "@/lib/write/coach-context";
import type { CoachSessionSummary } from "@/lib/coach/session-client";

/** 从 AI 管理拉取的模型项 */
type ModelOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type OutlineAgentStep = {
  id: string;
  label: string;
  status: "running" | "complete" | "degraded";
  detail?: string;
};

const MODEL_STORAGE_KEY = "inksight:workspace:coach:model";

/**
 * AI 教练对话面板
 *
 * 嵌入创作工作台右栏，提供流式对话。
 * 与素材库平级，共用右栏空间（AI 在上、素材折叠在下）。
 *
 * 半隔离架构：每个面板（正文/人物小传/大纲/细纲/对标文）独立维护对话历史，
 * 由父组件通过 messages + onMessagesChange 控制。
 *
 * 隐式 RAG：发送消息时自动从素材库检索相关素材，作为隐式引用注入上下文。
 *
 * 交互：
 *  - Enter 发送 / Shift+Enter 换行
 *  - 流式响应，可中途打断
 *  - 快捷意图按钮随当前面板场景切换
 *  - 教练回复可一键插入到当前面板编辑器
 */

/** 面板专属快捷意图 */
const QUICK_INTENTS: Record<PanelKey, { label: string; prompt: string }[]> = {
  draft: [],
  characters: [
    { label: "动机追问", prompt: "帮我追问这个角色的核心动机——他为什么这么做？" },
    { label: "关系缺环", prompt: "这个角色和主角的关系缺什么环节？帮我检查。" },
    { label: "弧光设计", prompt: "这个人物有弧光吗？怎么设计变化弧线？" },
    { label: "童年阴影", prompt: "帮我从童年阴影角度推演这个角色的执念来源。" },
  ],
  outline: [
    { label: "主线钩子", prompt: "我的主线钩子够不够强？帮我检查。" },
    { label: "中段塌陷", prompt: "大纲中段感觉塌了，怎么补？" },
    { label: "伏笔散乱", prompt: "伏笔太散了，帮我理一下回收线。" },
  ],
  synopsis: [
    { label: "事件密度", prompt: "这章事件密度够吗？感觉太平了。" },
    { label: "情绪起伏", prompt: "情绪曲线太平，怎么加起伏？" },
    { label: "场景节拍", prompt: "帮我把这章扩展成场景节拍，只列骨架。" },
  ],
  benchmark: [
    { label: "技法分析", prompt: "对标文的开头钩子是怎么做的？我能学到什么？" },
    { label: "找差距", prompt: "对标文和我的正文差在哪？帮我分析。" },
  ],
};

/** 面板专属开场白 */
const WELCOME_BY_PANEL: Record<PanelKey, string> = {
  draft:
    "我是你的创作教练。写到卡壳时问我节奏、转折、人物、对话都行。不用客套，直接说问题。",
  characters:
    "我是你的人物小传顾问。写下角色名和初步设定，我来追问动机、关系、弧光。我不替你补全人设，只帮你把角色想透。",
  outline:
    "我是你的大纲架构师。把零散的灵感或章节安排发给我，我来检查主线钩子、中段张力、伏笔回收。不替你写大纲，只帮你查漏洞。",
  synopsis:
    "我是你的细纲推手。把章纲发给我，我帮你拆成场景节拍——只列骨架不写肉。也可以问我事件密度和情绪曲线。",
  benchmark:
    "我是你的拆解分析师。把对标文片段发给我，我来分析技法，建议怎么用到你的作品里。",
};

interface Props {
  /** 当前激活面板，决定意图按钮与开场白 */
  activePanel: PanelKey;
  /** 获取创作上下文（含面板内容、跨面板文档、用户勾选素材） */
  getContext?: () => CoachContext;
  /** 隐式 RAG 检索：根据用户消息从素材库检索相关素材（支持异步 Zvec 向量搜索） */
  searchMaterials?: (query: string) => Promise<CoachReference[]>;
  /** 对话历史（受控，由父组件按面板隔离管理） */
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  /** 将教练回复插入到当前面板编辑器 */
  onInsertText?: (text: string) => void;
  /** 是否在浮窗模式（Cmd+K 唤出） */
  overlay?: boolean;
  onClose?: () => void;
  /** 工作台持久化对话树；浮窗使用独立临时对话，不传此组属性。 */
  sessions?: CoachSessionSummary[];
  activeSessionId?: string;
  onSessionChange?: (sessionId: string) => void;
  onBranchSession?: () => void;
  /** 用户隔离的持久化会话 id，用于 Pi provider 的会话亲和与上下文归属。 */
  agentSessionId?: string;
}

export function AICoachPanel({
  activePanel,
  getContext,
  searchMaterials,
  messages,
  onMessagesChange,
  onInsertText,
  overlay = false,
  onClose,
  sessions,
  activeSessionId,
  onSessionChange,
  onBranchSession,
  agentSessionId,
}: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const streamContentRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showReferences, setShowReferences] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState("");
  const [availableReferences, setAvailableReferences] = useState<
    CoachReference[]
  >([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(
    new Set()
  );
  /** 最近一次隐式检索到的素材数量（发送后展示提示） */
  const [implicitCount, setImplicitCount] = useState(0);
  /** 浮窗（细长条）模式：模型选择 */
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const slimInputRef = useRef<HTMLInputElement>(null);
  /** 技能弹窗（右侧面板模式） */
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillTab, setSkillTab] = useState<"prompts" | "links">("prompts");
  const skillMenuRef = useRef<HTMLDivElement>(null);
  /** 已选提示词技能（卡片展示在输入框内） */
  const [selectedSkills, setSelectedSkills] = useState<
    { id: string; label: string; prompt: string }[]
  >([]);
  /** 已选关联文档（与引用系统打通） */
  const [linkedPanels, setLinkedPanels] = useState<Set<string>>(new Set());
  /** 大纲 Agent 的只读工具执行状态（仅本次流式生成期间展示） */
  const [outlineAgentSteps, setOutlineAgentSteps] = useState<OutlineAgentStep[]>(
    []
  );
  const isOutlineAgent = activePanel === "outline" && !overlay;

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // 浮窗模式自动聚焦输入框（细长条 input / 普通面板 textarea）
  useEffect(() => {
    if (overlay) {
      slimInputRef.current?.focus();
    }
  }, [overlay]);

  // 拉取 AI 管理页的模型列表，并恢复用户上次选择
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-models");
        if (!res.ok) return;
        const data: Array<{ id: string; name: string; isActive: boolean }> =
          await res.json();
        if (cancelled) return;
        const opts = data.map((m) => ({
          id: m.id,
          name: m.name,
          isActive: !!m.isActive,
        }));
        setModels(opts);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(MODEL_STORAGE_KEY);
        } catch {
          // ignore
        }
        const exists = (id: string | null) =>
          !!id && opts.some((m) => m.id === id);
        if (exists(stored)) {
          setModelId(stored as string);
        } else {
          const active = opts.find((m) => m.isActive);
          setModelId(active?.id ?? opts[0]?.id ?? "");
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 点击外部关闭模型菜单
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  // 点击外部关闭技能菜单
  useEffect(() => {
    if (!skillMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [skillMenuOpen]);

  // 切换面板时中止正在进行的流式请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [activePanel]);

  useEffect(() => {
    const next = getContext?.().references ?? [];
    setAvailableReferences(next);
    const availableIds = new Set(next.map((reference) => reference.id));
    setSelectedReferenceIds((current) =>
      new Set(Array.from(current).filter((id) => availableIds.has(id)))
    );
  }, [getContext, activePanel]);

  const refreshReferences = useCallback(() => {
    const next = getContext?.().references ?? [];
    setAvailableReferences(next);
    const availableIds = new Set(next.map((reference) => reference.id));
    setSelectedReferenceIds((current) =>
      new Set(Array.from(current).filter((id) => availableIds.has(id)))
    );
  }, [getContext]);

  const toggleReference = useCallback((id: string) => {
    setSelectedReferenceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 8) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const rawContent = (text ?? input).trim();
      if (!rawContent || streaming) return;

      // 用户消息只展示原始输入（不含技能提示词前缀）
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: rawContent,
      };
      const updatedMessages = [...messages, userMsg];
      onMessagesChange(updatedMessages);
      setInput("");
      setStreaming(true);
      setStreamContent("");
      setImplicitCount(0);
      setOutlineAgentSteps([]);
      streamContentRef.current = "";

      const fullContext = getContext?.();
      const selectedReferences = availableReferences.filter((reference) =>
        selectedReferenceIds.has(reference.id)
      );

      // 非浮窗模式：将关联的左侧文档作为显式引用注入
      let linkedReferences: CoachReference[] = [];
      if (!overlay && linkedPanels.size > 0 && fullContext) {
        linkedReferences = fullContext.references.filter(
          (r) => r.kind === "document" && linkedPanels.has(r.id)
        );
      }

      // 隐式 RAG：根据用户消息从素材库检索相关素材（Zvec 向量搜索，降级 TF-IDF）
      // 大纲 Agent 将在服务端以当前用户权限完成同一项只读检索，避免重复请求。
      let implicitReferences: CoachReference[] = [];
      if (searchMaterials && !isOutlineAgent) {
        implicitReferences = await searchMaterials(rawContent);
        setImplicitCount(implicitReferences.length);
      }

      trackEvent("coach_message_sent", {
        length: rawContent.length,
        panel: activePanel,
        agent_mode: isOutlineAgent ? "outline-readonly" : "chat",
        reference_count: selectedReferences.length,
        reference_ids: selectedReferences.map((reference) => reference.id),
        implicit_count: implicitReferences.length,
      });

      // 构建 API 请求的消息历史（不含 welcome 欢迎语）
      // 非浮窗模式：最后一条用户消息拼接已选技能提示词作为前缀
      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome")
        .map((m, idx, arr) => {
          const isLast = idx === arr.length - 1;
          const isUser = m.role === "user";
          if (!overlay && isLast && isUser && selectedSkills.length > 0) {
            const skillPrefix = selectedSkills.map((s) => s.prompt).join("\n");
            return {
              role: "user" as const,
              content: `${skillPrefix}\n\n${m.content}`,
            };
          }
          return {
            role: (m.role === "coach" ? "assistant" : "user") as
              | "user"
              | "assistant",
            content: m.content,
          };
        })
        .slice(-29);

      // 合并显式引用 + 关联文档 + 隐式检索素材
      const allReferences = [
        ...selectedReferences,
        ...linkedReferences,
        ...implicitReferences,
      ];

      const context = fullContext
        ? { ...fullContext, references: allReferences }
        : undefined;

      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 45_000);

      try {
        const reqBody: {
          messages: typeof apiMessages;
          context?: typeof context;
          modelId?: string;
          overlay?: boolean;
          sessionId?: string;
        } = { messages: apiMessages, context };
        if (overlay) reqBody.overlay = true;
        if (modelId) reqBody.modelId = modelId;
        if (agentSessionId) reqBody.sessionId = agentSessionId;
        const resp = await fetch(isOutlineAgent ? "/api/outline-coach" : "/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          const coachMsg: ChatMessage = {
            id: `c-${Date.now()}`,
            role: "coach",
            content: errText || "教练暂时无法回复，请稍后再试。",
          };
          onMessagesChange([...updatedMessages, coachMsg]);
          return;
        }

        const reader = resp.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let accumulated = "";
        let eventBuffer = "";
        let agentError = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!isOutlineAgent) {
            accumulated += chunk;
            streamContentRef.current = accumulated;
            setStreamContent(accumulated);
            continue;
          }

          eventBuffer += chunk;
          const events = eventBuffer.split(/\r?\n\r?\n/);
          eventBuffer = events.pop() ?? "";
          for (const rawEvent of events) {
            let eventName = "message";
            let data = "";
            for (const line of rawEvent.split(/\r?\n/)) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;

            try {
              const payload = JSON.parse(data) as {
                id?: string;
                label?: string;
                status?: "complete" | "degraded";
                detail?: string;
                delta?: string;
                message?: string;
              };
              if (eventName === "text" && typeof payload.delta === "string") {
                accumulated += payload.delta;
                streamContentRef.current = accumulated;
                setStreamContent(accumulated);
              } else if (
                (eventName === "tool_start" || eventName === "tool_end") &&
                payload.id &&
                payload.label
              ) {
                setOutlineAgentSteps((steps) => {
                  const nextStep: OutlineAgentStep = {
                    id: payload.id as string,
                    label: payload.label as string,
                    status:
                      eventName === "tool_start"
                        ? "running"
                        : payload.status ?? "complete",
                    detail: payload.detail,
                  };
                  const index = steps.findIndex((step) => step.id === nextStep.id);
                  if (index < 0) return [...steps, nextStep];
                  const next = [...steps];
                  next[index] = nextStep;
                  return next;
                });
              } else if (eventName === "error" && payload.message) {
                agentError = payload.message;
              }
            } catch {
              // 忽略损坏的 SSE 事件，保留后续可解析的文本和状态。
            }
          }
        }

        if (!accumulated && agentError) accumulated = agentError;

        const coachMsg: ChatMessage = {
          id: `c-${Date.now()}`,
          role: "coach",
          content: accumulated || "（教练没有回复内容）",
        };
        onMessagesChange([...updatedMessages, coachMsg]);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (timedOut) {
            const coachMsg: ChatMessage = {
              id: `c-${Date.now()}`,
              role: "coach",
              content: "等待回复超时了。你选择的引用还在，可以稍后直接重试。",
            };
            onMessagesChange([...updatedMessages, coachMsg]);
            return;
          }
          // 用户主动打断，保留已生成内容
          if (streamContentRef.current) {
            const coachMsg: ChatMessage = {
              id: `c-${Date.now()}`,
              role: "coach",
              content: streamContentRef.current,
            };
            onMessagesChange([...updatedMessages, coachMsg]);
          }
        } else {
          const coachMsg: ChatMessage = {
            id: `c-${Date.now()}`,
            role: "coach",
            content: "网络异常，请检查连接后重试。",
          };
          onMessagesChange([...updatedMessages, coachMsg]);
        }
      } finally {
        window.clearTimeout(timeoutId);
        setStreaming(false);
        setStreamContent("");
        streamContentRef.current = "";
        abortRef.current = null;
        setOutlineAgentSteps([]);
      }
    },
    [
      input,
      streaming,
      messages,
      onMessagesChange,
      getContext,
      searchMaterials,
      activePanel,
      selectedReferenceIds,
      availableReferences,
      overlay,
      modelId,
      selectedSkills,
      linkedPanels,
      isOutlineAgent,
      agentSessionId,
    ]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInsert = useCallback(
    (text: string) => {
      if (!text.trim() || !onInsertText) return;
      onInsertText(text);
      trackEvent("coach_text_inserted", {
        panel: activePanel,
        length: text.length,
      });
    },
    [onInsertText, activePanel]
  );

  const activeSelectedReferences = availableReferences.filter((reference) =>
    selectedReferenceIds.has(reference.id)
  );

  const currentIntents = QUICK_INTENTS[activePanel] ?? QUICK_INTENTS.draft;

  const currentModel = models.find((m) => m.id === modelId);
  const currentModelLabel = currentModel?.name ?? "默认";

  const handleModelSelect = (id: string) => {
    setModelId(id);
    setModelMenuOpen(false);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  /** 可选提示词技能列表（右侧面板） */
  const SKILL_PROMPTS = [
    { id: "guide", label: "写导语", prompt: "请根据当前正文内容，帮我写一段吸引人的导语。" },
    { id: "outline", label: "大纲生成", prompt: "请根据当前正文和设定，帮我生成大纲。" },
    { id: "detail-outline", label: "细纲生成", prompt: "请根据当前大纲，帮我扩展生成细纲。" },
  ];

  /** 可关联的左侧文档列表 */
  const LINK_PANELS = [
    { id: "benchmark", label: "对标文" },
    { id: "characters", label: "人物小传" },
    { id: "outline", label: "大纲" },
    { id: "synopsis", label: "细纲" },
  ];

  const handleSkillToggle = (skill: { id: string; label: string; prompt: string }) => {
    setSelectedSkills((prev) =>
      prev.some((s) => s.id === skill.id)
        ? prev.filter((s) => s.id !== skill.id)
        : [...prev, skill]
    );
  };

  const handleLinkToggle = (panelId: string) => {
    setLinkedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  };

  const removeSkill = (id: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.id !== id));
  };

  // ===== 浮窗模式：细长条输入框（模型选择 + 输入 + 发送 Icon）=====
  if (overlay) {
    const lastCoachMsg = [...messages]
      .reverse()
      .find((m) => m.role === "coach" && m.id !== "welcome");
    const showResponse = streaming || lastCoachMsg;

    return (
      <div className="flex flex-col gap-2">
        {/* 流式 / 最近一次回复（显示在条形输入框上方） */}
        {showResponse && (
          <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-text/[0.06] bg-bg-soft/80 p-4 shadow-lg backdrop-blur">
            {streaming ? (
              streamContent ? (
                <p className="whitespace-pre-wrap font-serif text-[14px] leading-[1.7] text-text">
                  {streamContent}
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-accent-warm align-middle" />
                </p>
              ) : (
                <span className="font-serif text-[14px] text-text-muted">
                  正在思考…
                </span>
              )
            ) : (
              <div className="group">
                <p className="whitespace-pre-wrap font-serif text-[14px] leading-[1.7] text-text">
                  {lastCoachMsg?.content}
                </p>
                {onInsertText && lastCoachMsg?.content.trim() && (
                  <button
                    type="button"
                    onClick={() => handleInsert(lastCoachMsg.content)}
                    className="mt-2 flex items-center gap-1 rounded-sm border border-text/[0.06] px-2 py-0.5 font-mono text-[10px] text-text-muted transition-colors hover:border-accent-warm/30 hover:text-text"
                  >
                    <span>↩</span>
                    <span>插入到编辑器</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 细长条输入框 */}
        <div className="flex items-center gap-2 rounded-full border border-text/[0.10] bg-surface px-3 py-2 shadow-2xl">
          {/* 框头：模型下拉选择 */}
          <div className="relative flex-shrink-0" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setModelMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:text-text"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="8" width="18" height="8" rx="2" />
                <circle cx="8" cy="12" r="1" fill="currentColor" />
              </svg>
              <span className="max-w-[100px] truncate font-medium">
                {currentModelLabel}
              </span>
              <svg
                width="8"
                height="8"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>
            {modelMenuOpen && (
              <div className="absolute bottom-full mb-2 left-0 min-w-[180px] rounded-xl border border-text/[0.08] bg-surface py-1 shadow-xl z-10">
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModelSelect(m.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-bg ${
                      m.id === modelId ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {m.id === modelId && (
                      <span className="text-[8px] text-accent">●</span>
                    )}
                  </button>
                ))}
                {models.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-text-muted">
                    未配置模型
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="h-5 w-px flex-shrink-0 bg-text/[0.08]" />

          {/* 输入框 */}
          <input
            ref={slimInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="问教练…（Enter 发送 / ESC 关闭）"
            className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-muted/40"
          />

          {/* 框尾：发送 / 停止 Icon */}
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-text/10 text-text-muted transition-colors hover:bg-text/20"
              aria-label="停止"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-30"
              aria-label="发送"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 对话头 */}
      <div className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-text/[0.06] px-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-warm/[0.08]">
          <span className="font-serif text-[11px] font-semibold text-accent-warm">
            教
          </span>
        </span>
        <span className="font-mono text-[10px] text-text-muted">Coach</span>
        {sessions && activeSessionId && onSessionChange && (
          <select
            value={activeSessionId}
            onChange={(event) => onSessionChange(event.target.value)}
            disabled={streaming}
            aria-label="切换对话分支"
            className="max-w-[110px] truncate bg-transparent font-mono text-[9px] text-text-muted outline-none disabled:opacity-50"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.parentId ? "↳ " : ""}{session.label}
              </option>
            ))}
          </select>
        )}
        {onBranchSession && activeSessionId && (
          <button
            type="button"
            onClick={onBranchSession}
            disabled={streaming}
            title="从当前对话创建分支"
            className="rounded-sm border border-text/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-text-muted transition-colors hover:border-accent-warm/30 hover:text-text disabled:opacity-40"
          >
            分支
          </button>
        )}
        <span className="ml-auto font-mono text-[9px] text-text-muted/50">
          {isOutlineAgent ? "大纲 Agent · 只读" : "AI 教练"}
        </span>
        {overlay && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 font-mono text-[10px] text-text-muted transition-colors hover:text-text"
          >
            ESC
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "coach"
                  ? "group border-l-2 border-accent-warm/20 bg-bg-soft/60 px-3 py-2"
                  : "px-3 py-2 text-text-muted"
              }
            >
              {msg.role === "coach" && (
                <span className="mb-1 block font-mono text-[9px] text-text-muted/60">
                  教练
                </span>
              )}
              <p
                className={
                  msg.role === "coach"
                    ? "whitespace-pre-wrap font-serif text-[13px] leading-[1.6] text-text"
                    : "whitespace-pre-wrap text-[13px] leading-[1.6] text-text-muted"
                }
              >
                {msg.content}
              </p>
              {/* 教练回复：插入到编辑器按钮 */}
              {msg.role === "coach" &&
                msg.id !== "welcome" &&
                onInsertText &&
                msg.content.trim() && (
                  <button
                    type="button"
                    onClick={() => handleInsert(msg.content)}
                    title="插入到当前编辑器"
                    className="mt-1.5 flex items-center gap-1 rounded-sm border border-text/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-text-muted opacity-0 transition-all hover:border-accent-warm/30 hover:text-text group-hover:opacity-100"
                  >
                    <span>↩</span>
                    <span>插入</span>
                  </button>
                )}
            </div>
          ))}

          {/* 流式响应 */}
          {streaming && (
            <div className="group border-l-2 border-accent-warm/20 bg-bg-soft/60 px-3 py-2">
              <span className="mb-1 block font-mono text-[9px] text-text-muted/60">
                {isOutlineAgent ? "大纲 Agent · 只读" : "教练"}
              </span>
              {isOutlineAgent && outlineAgentSteps.length > 0 && (
                <div className="mb-2 space-y-1 border-b border-text/[0.06] pb-2 font-mono text-[9px] text-text-muted">
                  {outlineAgentSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-1.5">
                      <span
                        className={
                          step.status === "running"
                            ? "h-1.5 w-1.5 animate-pulse rounded-full bg-accent-warm"
                            : step.status === "degraded"
                              ? "h-1.5 w-1.5 rounded-full bg-warning"
                              : "h-1.5 w-1.5 rounded-full bg-success"
                        }
                      />
                      <span>{step.label}</span>
                      {step.detail && (
                        <span className="truncate text-text-muted/60">· {step.detail}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {streamContent ? (
                <p className="whitespace-pre-wrap font-serif text-[13px] leading-[1.6] text-text">
                  {streamContent}
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-accent-warm align-middle" />
                </p>
              ) : (
                <span className="font-serif text-[13px] text-text-muted">
                  正在思考…
                </span>
              )}
            </div>
          )}

          {/* 隐式检索提示 */}
          {!streaming && implicitCount > 0 && (
            <p className="px-3 text-[9px] text-text-muted/45">
              已从素材库匹配 {implicitCount} 条相关素材作为参考
            </p>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* 快捷意图（非流式时显示，且消息少于 2 条 = 只有欢迎语时） */}
      {!streaming && messages.length <= 1 && (
        <div className="flex flex-shrink-0 flex-wrap gap-1 px-3 pb-1.5">
          {currentIntents.map((intent) => (
            <button
              key={intent.label}
              type="button"
              onClick={() => handleSend(intent.prompt)}
              className="rounded-sm border border-text/[0.06] bg-surface px-2 py-1 text-[10px] text-text-muted transition-colors hover:border-accent-warm/30 hover:text-text"
            >
              {intent.label}
            </button>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="flex-shrink-0 border-t border-text/[0.06] px-3 py-2.5">
        {/* 已选技能卡片 */}
        {(selectedSkills.length > 0 || linkedPanels.size > 0) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-1 rounded-md border border-accent/30 bg-bg px-2 py-1 text-[11px] text-accent shadow-sm"
              >
                <span className="font-mono text-[9px] text-accent/60">@</span>
                <span className="font-serif font-medium">{skill.label}</span>
                <button
                  type="button"
                  onClick={() => removeSkill(skill.id)}
                  aria-label={`取消 ${skill.label}`}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-accent transition-all hover:bg-accent hover:text-text-inverse"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            ))}
            {LINK_PANELS.filter((p) => linkedPanels.has(p.id)).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1 rounded-md border border-text/20 bg-bg px-2 py-1 text-[11px] text-text-muted shadow-sm"
              >
                <span className="font-mono text-[9px] text-text-muted/60">#</span>
                <span className="font-serif font-medium">{p.label}</span>
                <button
                  type="button"
                  onClick={() => handleLinkToggle(p.id)}
                  aria-label={`取消关联 ${p.label}`}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-text-muted transition-all hover:bg-text/20"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOutlineAgent ? "问大纲 Agent…" : "问教练…"}
            rows={1}
            className="w-full resize-none border border-text/[0.10] rounded-lg bg-bg px-3 pb-7 pt-2.5 font-sans text-[13px] text-text outline-none placeholder:text-text-muted/40 focus:border-accent/40"
            style={{ maxHeight: "120px" }}
          />

          {/* 左下角：技能 Icon + 模型选择 */}
          <div className="absolute bottom-1.5 left-2 flex items-center gap-1">
            {/* 技能 Icon */}
            <div className="relative" ref={skillMenuRef}>
              <button
                type="button"
                onClick={() => setSkillMenuOpen((v) => !v)}
                title="技能"
                aria-label="技能"
                className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                  skillMenuOpen || selectedSkills.length > 0 || linkedPanels.size > 0
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:bg-text/5 hover:text-text"
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </button>
              {skillMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-[220px] rounded-xl border border-text/[0.08] bg-surface shadow-xl z-10 overflow-hidden">
                  {/* 分页切换 */}
                  <div className="flex border-b border-text/[0.06]">
                    <button
                      type="button"
                      onClick={() => setSkillTab("prompts")}
                      className={`flex-1 px-3 py-1.5 text-[11px] transition-colors ${
                        skillTab === "prompts"
                          ? "bg-bg text-accent font-medium"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      提示词
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkillTab("links")}
                      className={`flex-1 px-3 py-1.5 text-[11px] transition-colors ${
                        skillTab === "links"
                          ? "bg-bg text-accent font-medium"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      关联
                    </button>
                  </div>

                  {/* 提示词分页 */}
                  {skillTab === "prompts" && (
                    <div className="py-1">
                      {SKILL_PROMPTS.map((skill) => {
                        const checked = selectedSkills.some((s) => s.id === skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => handleSkillToggle(skill)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-bg ${
                              checked ? "text-accent" : "text-text-muted"
                            }`}
                          >
                            <span className="truncate">{skill.label}</span>
                            {checked && <span className="text-[8px] text-accent">●</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 关联分页 */}
                  {skillTab === "links" && (
                    <div className="py-1">
                      {LINK_PANELS.map((panel) => {
                        const checked = linkedPanels.has(panel.id);
                        return (
                          <button
                            key={panel.id}
                            type="button"
                            onClick={() => handleLinkToggle(panel.id)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-bg ${
                              checked ? "text-accent" : "text-text-muted"
                            }`}
                          >
                            <span className="truncate">{panel.label}</span>
                            {checked && <span className="text-[8px] text-accent">●</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 模型选择 */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setModelMenuOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:text-text"
                title="选择模型"
              >
                <span className="max-w-[80px] truncate font-medium">
                  {currentModelLabel}
                </span>
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 5l3 3 3-3" />
                </svg>
              </button>
              {modelMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 min-w-[160px] rounded-xl border border-text/[0.08] bg-surface py-1 shadow-xl z-10">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelSelect(m.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-bg ${
                        m.id === modelId ? "text-accent" : "text-text-muted"
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      {m.id === modelId && <span className="text-[8px] text-accent">●</span>}
                    </button>
                  ))}
                  {models.length === 0 && (
                    <p className="px-3 py-2 text-[10px] text-text-muted">未配置模型</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右下角：发送 / 停止 */}
          <div className="absolute bottom-1.5 right-2">
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-text/10 text-text-muted transition-colors hover:bg-text/20"
                aria-label="停止"
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-30"
                aria-label="发送"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 生成面板专属欢迎消息 */
export function createWelcomeMessage(panel: PanelKey): ChatMessage {
  return {
    id: "welcome",
    role: "coach",
    content: WELCOME_BY_PANEL[panel] ?? WELCOME_BY_PANEL.draft,
  };
}
