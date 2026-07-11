"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { trackEvent } from "@/lib/report/analytics";
import type { CoachContext, CoachReference } from "@/lib/write/coach-context";

/**
 * AI 教练对话面板
 *
 * 嵌入创作工作台右栏，提供流式对话。
 * 与素材库平级，共用右栏空间（AI 在上、素材折叠在下）。
 *
 * 交互：
 *  - Enter 发送 / Shift+Enter 换行
 *  - 流式响应，可中途打断
 *  - 快捷意图按钮（节奏/转折/人物/对话）
 */

type ChatMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
};

const QUICK_INTENTS = [
  { label: "节奏太慢", prompt: "我写到中段感觉节奏拖了，怎么加快？" },
  { label: "转折生硬", prompt: "这个转折读者觉得突兀，怎么铺垫更自然？" },
  { label: "人物扁平", prompt: "这个角色感觉单薄，怎么让 ta 更立体？" },
  { label: "对话不自然", prompt: "这段对话读起来像念稿，怎么改得像人话？" },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "coach",
  content:
    "我是你的创作教练。写到卡壳时问我节奏、转折、人物、对话都行。不用客套，直接说问题。",
};

interface Props {
  getContext?: () => CoachContext;
  /** 是否在浮窗模式（Cmd+K 唤出） */
  overlay?: boolean;
  onClose?: () => void;
}

export function AICoachPanel({ getContext, overlay = false, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const streamContentRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showReferences, setShowReferences] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState("");
  const [availableReferences, setAvailableReferences] = useState<CoachReference[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(
    new Set()
  );

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

  useEffect(() => {
    const next = getContext?.().references ?? [];
    setAvailableReferences(next);
    const availableIds = new Set(next.map((reference) => reference.id));
    setSelectedReferenceIds((current) =>
      new Set(Array.from(current).filter((id) => availableIds.has(id)))
    );
  }, [getContext]);

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
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStreaming(true);
      setStreamContent("");
      streamContentRef.current = "";

      const fullContext = getContext?.();
      const selectedReferences = availableReferences.filter((reference) =>
        selectedReferenceIds.has(reference.id)
      );

      trackEvent("coach_message_sent", {
        length: content.length,
        reference_count: selectedReferences.length,
        reference_ids: selectedReferences.map((reference) => reference.id),
      });

      // 构建 API 请求的消息历史（不含 welcome 欢迎语）
      const apiMessages = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role === "coach" ? "assistant" : "user",
          content: m.content,
        }))
        .slice(-29);

      const context = fullContext
        ? { ...fullContext, references: selectedReferences }
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
          setMessages((prev) => [...prev, coachMsg]);
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
        setMessages((prev) => [...prev, coachMsg]);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (timedOut) {
            const coachMsg: ChatMessage = {
              id: `c-${Date.now()}`,
              role: "coach",
              content: "等待回复超时了。你选择的引用还在，可以稍后直接重试。",
            };
            setMessages((prev) => [...prev, coachMsg]);
            return;
          }
          // 用户主动打断，保留已生成内容
          if (streamContentRef.current) {
            const coachMsg: ChatMessage = {
              id: `c-${Date.now()}`,
              role: "coach",
              content: streamContentRef.current,
            };
            setMessages((prev) => [...prev, coachMsg]);
          }
        } else {
          const coachMsg: ChatMessage = {
            id: `c-${Date.now()}`,
            role: "coach",
            content: "网络异常，请检查连接后重试。",
          };
          setMessages((prev) => [...prev, coachMsg]);
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
      getContext,
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

  const activeSelectedReferences = availableReferences.filter((reference) =>
    selectedReferenceIds.has(reference.id)
  );

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
                    reference.label.toLowerCase().includes(referenceQuery.trim().toLowerCase()) ||
                    reference.content.toLowerCase().includes(referenceQuery.trim().toLowerCase()))
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
                            <span className="block truncate text-[11px] text-text">{reference.label}</span>
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
            <p className="mt-1 px-1 text-[9px] text-text-muted/45">最多同时引用 8 项。</p>
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
                  ? "border-l-2 border-accent-warm/20 bg-bg-soft/60 px-3 py-2"
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
            </div>
          ))}

          {/* 流式响应 */}
          {streaming && (
            <div className="border-l-2 border-accent-warm/20 bg-bg-soft/60 px-3 py-2">
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
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* 快捷意图（非流式时显示） */}
      {!streaming && messages.length <= 1 && (
        <div className="flex flex-shrink-0 flex-wrap gap-1 px-3 pb-1.5">
          {QUICK_INTENTS.map((intent) => (
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
