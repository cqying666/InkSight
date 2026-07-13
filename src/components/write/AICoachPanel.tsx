"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { trackEvent } from "@/lib/report/analytics";
import type {
  CoachContext,
  CoachReference,
  PanelKey,
  ChatMessage,
} from "@/lib/write/coach-context";

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
  draft: [
    { label: "节奏太慢", prompt: "我写到中段感觉节奏拖了，怎么加快？" },
    { label: "转折生硬", prompt: "这个转折读者觉得突兀，怎么铺垫更自然？" },
    { label: "人物扁平", prompt: "这个角色感觉单薄，怎么让 ta 更立体？" },
    { label: "对话不自然", prompt: "这段对话读起来像念稿，怎么改得像人话？" },
  ],
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
  /** 隐式 RAG 检索：根据用户消息从素材库检索相关素材 */
  searchMaterials?: (query: string) => CoachReference[];
  /** 对话历史（受控，由父组件按面板隔离管理） */
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  /** 将教练回复插入到当前面板编辑器 */
  onInsertText?: (text: string) => void;
  /** 是否在浮窗模式（Cmd+K 唤出） */
  overlay?: boolean;
  onClose?: () => void;
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

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // 浮窗模式自动聚焦输入框
  useEffect(() => {
    if (overlay) {
      inputRef.current?.focus();
    }
  }, [overlay]);

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
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
      };
      const updatedMessages = [...messages, userMsg];
      onMessagesChange(updatedMessages);
      setInput("");
      setStreaming(true);
      setStreamContent("");
      setImplicitCount(0);
      streamContentRef.current = "";

      const fullContext = getContext?.();
      const selectedReferences = availableReferences.filter((reference) =>
        selectedReferenceIds.has(reference.id)
      );

      // 隐式 RAG：根据用户消息从素材库检索相关素材
      let implicitReferences: CoachReference[] = [];
      if (searchMaterials) {
        implicitReferences = searchMaterials(content);
        setImplicitCount(implicitReferences.length);
      }

      trackEvent("coach_message_sent", {
        length: content.length,
        panel: activePanel,
        reference_count: selectedReferences.length,
        reference_ids: selectedReferences.map((reference) => reference.id),
        implicit_count: implicitReferences.length,
      });

      // 构建 API 请求的消息历史（不含 welcome 欢迎语）
      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role === "coach" ? "assistant" : "user",
          content: m.content,
        }))
        .slice(-29);

      // 合并显式引用 + 隐式检索素材
      const allReferences = [...selectedReferences, ...implicitReferences];

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
        const resp = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, context }),
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          streamContentRef.current = accumulated;
          setStreamContent(accumulated);
        }

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
        <span className="ml-auto font-mono text-[9px] text-text-muted/50">
          {activeSelectedReferences.length > 0
            ? `已引用 ${activeSelectedReferences.length} 项`
            : "AI 教练"}
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

      {/* 引用选择器 */}
      <div className="flex-shrink-0 border-b border-text/[0.06] bg-bg/45 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refreshReferences();
              setShowReferences((current) => !current);
            }}
            className="rounded-full border border-text/[0.08] bg-surface px-2.5 py-1 text-[10px] text-text-muted transition-colors hover:border-accent/30 hover:text-text"
          >
            ＋ 引用文档或素材
          </button>
          <span className="truncate text-[9px] text-text-muted/55">
            {activeSelectedReferences.length > 0
              ? "发送时会连同选中内容交给教练"
              : "未选择引用"}
          </span>
        </div>

        {activeSelectedReferences.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {activeSelectedReferences.map((reference) => (
              <button
                key={reference.id}
                type="button"
                onClick={() => toggleReference(reference.id)}
                title={`移除引用：${reference.label}`}
                className="max-w-full truncate rounded-full bg-accent/[0.08] px-2 py-0.5 text-[9px] text-accent"
              >
                @{reference.label} ×
              </button>
            ))}
          </div>
        )}

        {showReferences && (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-text/[0.06] bg-surface p-2 shadow-card">
            <input
              value={referenceQuery}
              onChange={(event) => setReferenceQuery(event.target.value)}
              placeholder="搜索素材名称…"
              className="mb-2 w-full rounded-lg border border-text/[0.08] bg-bg px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
            />
            {(["document", "material"] as const).map((kind) => {
              const items = availableReferences.filter(
                (reference) =>
                  reference.kind === kind &&
                  (!referenceQuery.trim() ||
                    reference.label
                      .toLowerCase()
                      .includes(referenceQuery.trim().toLowerCase()) ||
                    reference.content
                      .toLowerCase()
                      .includes(referenceQuery.trim().toLowerCase()))
              );
              if (items.length === 0) return null;
              return (
                <div key={kind} className="mb-2 last:mb-0">
                  <p className="mb-1 px-1 text-[9px] uppercase tracking-[0.12em] text-text-muted/55">
                    {kind === "document" ? "左侧文档" : "素材库"}
                  </p>
                  <div className="space-y-1">
                    {items.map((reference) => {
                      const checked = selectedReferenceIds.has(reference.id);
                      return (
                        <label
                          key={reference.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReference(reference.id)}
                            className="mt-0.5 accent-primary"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] text-text">
                              {reference.label}
                            </span>
                            <span className="block truncate text-[9px] text-text-muted/55">
                              {reference.content.slice(0, 60)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {availableReferences.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px] text-text-muted">
                当前文档和素材库还没有可引用内容。
              </p>
            )}
            <p className="mt-1 px-1 text-[9px] text-text-muted/45">
              最多同时引用 8 项。
            </p>
          </div>
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
                教练
              </span>
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
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="问教练…"
            rows={1}
            className="flex-1 resize-none border-none bg-transparent font-sans text-[13px] text-text outline-none placeholder:text-text-muted/40"
            style={{ maxHeight: "80px" }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-shrink-0 rounded-sm border border-text/[0.10] px-2.5 py-1 font-mono text-[10px] text-text-muted transition-colors hover:border-accent-warm/40 hover:text-text"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="flex-shrink-0 rounded-sm bg-primary px-2.5 py-1 font-mono text-[10px] text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              发送
            </button>
          )}
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
