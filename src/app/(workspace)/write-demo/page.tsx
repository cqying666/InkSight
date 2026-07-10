"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * 创作工作台三栏布局 Demo
 *
 * 基于圆桌讨论共识：
 * - 左栏：复用 WorkspaceShell 的 WorkspaceSidebar（进入时自动折叠为 w-16 图标条）
 * - 中栏：编辑器（flex-1，视觉焦点）
 * - 右栏：AI 对话为主常驻（60%+）+ 素材库折叠抽屉（24px 底部把手）
 * - Cmd+K：唤出 AI 教练 portal overlay
 * - Cmd+.：深度专注模式（收起右栏）
 * - 栏间 1px hairline 分隔
 * - 右栏宽度上限 280px
 */

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  content: string;
};

// ===== 模拟 AI 教练回复 =====
const COACH_REPLIES = [
  "这个转折可以更自然。试试在对话前加一个停顿动作——角色拿起杯子又放下，读者会感到犹豫的张力。",
  "开头的钩子不错，但第三段节奏拖了。建议把环境描写压到两句以内，让悬念更快浮出。",
  "人物动机这里需要铺垫。读者如果不理解她为什么撒谎，后面的反转就只是技巧而非情感冲击。",
  "对话的语气和前文的人设有出入。她之前是克制的，这里突然激动会让读者出戏。可以改成冷冷的一句。",
];

type ViewKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

const NAV_ITEMS: { key: ViewKey; label: string; icon: string; hint: string }[] = [
  { key: "draft", label: "正文", icon: "正", hint: "创作编辑" },
  { key: "benchmark", label: "对标文", icon: "对", hint: "参考作品" },
  { key: "outline", label: "大纲", icon: "纲", hint: "故事骨架" },
  { key: "synopsis", label: "细纲", icon: "细", hint: "分章细纲" },
  { key: "characters", label: "人物小传", icon: "人", hint: "角色档案" },
];

const DEMO_OUTLINE = [
  { label: "开头钩子", done: true },
  { label: "人物登场", done: true },
  { label: "第一次冲突", done: false },
  { label: "反转铺垫", done: false },
  { label: "高潮收束", done: false },
];

const DEMO_MATERIALS = [
  { id: "m1", label: "场景 · 雨夜便利店", snippet: "荧光灯管在头顶嗡嗡作响，关东煮的热气模糊了玻璃门外的雨幕…" },
  { id: "m2", label: "对话 · 克制的拒绝", snippet: "「不用了。」她把杯子推回去，指尖在杯沿停了一秒才收回。" },
  { id: "m3", label: "情绪 · 隐忍的愤怒", snippet: "他笑着说好的，但握筷子的手关节发白。" },
  { id: "m4", label: "节奏 · 三短一长", snippet: "敲门。停。再敲。然后是一连串急促的拍打。" },
];

const DEMO_CHARACTERS = [
  {
    name: "林夏",
    role: "主角",
    age: "28",
    traits: "克制、理性、习惯隐藏真实情绪",
    arc: "从隐忍到爆发，最终选择坦白",
    detail: "广告公司文案，三年前父亲离世后开始独居。习惯用沉默处理冲突，直到遇见陈末。",
  },
  {
    name: "陈末",
    role: "对手/镜像",
    age: "31",
    traits: "直接、锐利、不回避尴尬",
    arc: "用真诚击碎林夏的防御",
    detail: "新来的合伙人，说话从不绕弯。第一次开会就当面否定林夏的方案。",
  },
  {
    name: "老周",
    role: "配角",
    age: "55",
    traits: "世故、温和、打圆场",
    arc: "见证者，推动林夏正视自己",
    detail: "公司总监，快退休了。看在眼里但从不多嘴。",
  },
];

const DEMO_SYNOPSIS = [
  {
    chapter: "第一章 · 雨夜",
    beats: "林夏加班到深夜，便利店遇到陈末。冷场对话建立两人关系基调。",
    emotion: "疏离 → 微妙的好奇",
  },
  {
    chapter: "第二章 · 否定",
    beats: "陈末在会议上公开否定林夏方案。林夏表面平静，内心震动。",
    emotion: "克制愤怒 → 自我怀疑",
  },
  {
    chapter: "第三章 · 坦白",
    beats: "天台对话。陈末问林夏为什么从不为自己说话。林夏崩溃。",
    emotion: "防御崩塌 → 释放",
  },
  {
    chapter: "第四章 · 重写",
    beats: "林夏重写方案，第一次直接表达自己的判断。陈末点头。",
    emotion: "重建 → 平静的勇气",
  },
];

const DEMO_BENCHMARK = `「最后一班地铁已经开走了。」

她站在站台尽头，雨水从发梢滴下来，在脚边汇成一小滩。便利店的荧光灯管嗡嗡作响，关东煮的热气模糊了玻璃门外的雨幕。

他站在她身后三步远的地方，手里撑着一把黑伞，但没有走过来。

「你不打伞？」他问。

「忘了。」她说，没有回头。

沉默。雨声。便利店的门被推开又关上，带出一阵热气和关东煮的味道。

「我请你喝碗汤。」他说。

「不用了。」

他把伞递过来，没有再说话。她接过伞的时候，指尖碰到了他的手背，凉的。

——这就是他们第一次见面的样子。克制、礼貌、彼此留了距离。后来她常想，如果那天她没有接过那把伞，后面所有的事是不是就不会发生。`;

export default function WriteDemoPage() {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [deepFocus, setDeepFocus] = useState(false);
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [materialExpanded, setMaterialExpanded] = useState(false);
  const [materialMounted, setMaterialMounted] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("draft");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "coach",
      content: "我是你的创作教练。写到卡壳的时候按 Cmd+K 唤我，或者直接在下面问我。",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ===== 进入页面时自动折叠左侧导航 =====
  useEffect(() => {
    setMounted(true);
    try {
      localStorage.setItem("inksight:nav-collapsed", "1");
    } catch {
      // ignore
    }
    // 触发 WorkspaceShell 重新读取
    window.dispatchEvent(new Event("storage"));
  }, []);

  // ===== 快捷键：Cmd+K 唤出 AI / Cmd+. 深度专注 =====
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

  // ===== 编辑器字数统计 =====
  const handleEditorInput = useCallback(() => {
    const text = editorRef.current?.innerText || "";
    setWordCount(text.replace(/\s/g, "").length);
  }, []);

  // ===== 发送消息 =====
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // 模拟教练回复
    setTimeout(() => {
      const reply = COACH_REPLIES[Math.floor(Math.random() * COACH_REPLIES.length)];
      const coachMsg: ChatMessage = {
        id: `c-${Date.now()}`,
        role: "coach",
        content: reply,
      };
      setMessages((prev) => [...prev, coachMsg]);
      setIsTyping(false);
    }, 1200);
  }, [input]);

  // ===== 首次展开素材库时 mount =====
  const handleExpandMaterial = useCallback(() => {
    if (!materialMounted) setMaterialMounted(true);
    setMaterialExpanded((v) => !v);
  }, [materialMounted]);

  // 自动滚动到最新消息
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!mounted) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      {/* ===== 顶部细栏（深度专注时隐藏） ===== */}
      {!deepFocus && (
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-base font-semibold text-text">
              创作工作台
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {wordCount > 0 ? `${wordCount} 字` : "未开始"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              ⌘K
            </kbd>
            <span className="font-mono text-[10px] text-text-muted">唤出教练</span>
            <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              ⌘.
            </kbd>
            <span className="font-mono text-[10px] text-text-muted">深度专注</span>
          </div>
        </header>
      )}

      {/* ===== 主体：工作台导航 + 编辑器 + 右栏 ===== */}
      <div className="flex min-h-0 flex-1">
        {/* --- 工作台内导航栏（深度专注时隐藏） --- */}
        {!deepFocus && (
          <nav
            className={`flex flex-shrink-0 flex-col border-r border-border transition-all duration-200 ${
              navCollapsed ? "w-12" : "w-48"
            }`}
          >
            {/* 折叠按钮 */}
            <button
              type="button"
              onClick={() => setNavCollapsed((v) => !v)}
              className="flex h-9 flex-shrink-0 items-center justify-center border-b border-border text-text-muted transition-colors hover:bg-bg-soft/40"
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
                    onClick={() => setActiveView(item.key)}
                    title={navCollapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 transition-colors ${
                      isActive
                        ? "bg-primary/[0.04] text-text"
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
                      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 底部状态 */}
            {!navCollapsed && (
              <div className="flex-shrink-0 border-t border-border px-3 py-2">
                <div className="font-mono text-[9px] text-text-muted/50">
                  文档导航
                </div>
              </div>
            )}
          </nav>
        )}

        {/* --- 中栏：编辑器/文档区 --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 正文视图 */}
          {activeView === "draft" && (
            <>
              {/* 编辑器内容区 */}
              <div className="mx-auto flex h-full w-full max-w-[680px] flex-col px-10 py-8">
                {/* 标题 */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="作品标题…"
                  className="mb-6 w-full border-none bg-transparent font-serif text-title-lg text-text outline-none placeholder:text-text-muted/40"
                />

                {/* 正文编辑器 */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  className="write-editor flex-1 overflow-y-auto font-serif text-[15px] leading-[1.85] text-text outline-none"
                  style={{ caretColor: "#1C1C1E" }}
                  data-placeholder="开始写下你的故事…"
                />
              </div>
            </>
          )}

          {/* 对标文视图 */}
          {activeView === "benchmark" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-serif text-title-lg text-text">对标文</h2>
                  <span className="font-mono text-[10px] text-text-muted">
                    参考作品 · 只读
                  </span>
                </div>
                <p className="mb-6 font-mono text-[10px] text-text-muted/60">
                  点击左侧切换其他文档。对标文用于创作时随时对照节奏与语气。
                </p>
                <div className="border-l-2 border-border pl-5">
                  <pre className="whitespace-pre-wrap font-serif text-[14px] leading-[1.85] text-text">
{DEMO_BENCHMARK}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* 大纲视图 */}
          {activeView === "outline" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <h2 className="mb-6 font-serif text-title-lg text-text">大纲</h2>
                <div className="space-y-3">
                  {DEMO_OUTLINE.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 border-l border-border pl-4"
                    >
                      <span
                        className={`font-mono text-[11px] ${
                          item.done ? "text-primary/40" : "text-text-muted/40"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1">
                        <span
                          className={`text-[14px] ${
                            item.done
                              ? "text-text-muted line-through"
                              : "text-text"
                          }`}
                        >
                          {item.label}
                        </span>
                        {item.done && (
                          <span className="ml-2 font-mono text-[9px] text-text-muted/40">
                            已完成
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-6 font-mono text-[11px] text-text-muted transition-colors hover:text-text"
                >
                  + 添加节点
                </button>
              </div>
            </div>
          )}

          {/* 细纲视图 */}
          {activeView === "synopsis" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <h2 className="mb-6 font-serif text-title-lg text-text">细纲</h2>
                <div className="space-y-5">
                  {DEMO_SYNOPSIS.map((ch, i) => (
                    <div
                      key={i}
                      className="border-l border-border pl-5"
                    >
                      <div className="mb-1.5 flex items-baseline gap-2">
                        <span className="font-mono text-[10px] text-text-muted/40">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-serif text-[15px] font-semibold text-text">
                          {ch.chapter}
                        </span>
                      </div>
                      <p className="mb-1.5 text-[13px] leading-[1.6] text-text">
                        {ch.beats}
                      </p>
                      <p className="font-mono text-[10px] text-text-muted/60">
                        情绪线：{ch.emotion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 人物小传视图 */}
          {activeView === "characters" && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-[680px] px-10 py-8">
                <h2 className="mb-6 font-serif text-title-lg text-text">人物小传</h2>
                <div className="space-y-4">
                  {DEMO_CHARACTERS.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-surface p-4"
                    >
                      <div className="mb-2 flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="font-serif text-[16px] font-semibold text-text">
                            {c.name}
                          </span>
                          <span className="font-mono text-[10px] text-text-muted">
                            {c.role} · {c.age}岁
                          </span>
                        </div>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {c.traits.split("、").map((trait, ti) => (
                          <span
                            key={ti}
                            className="rounded-sm bg-bg-soft px-1.5 py-0.5 font-mono text-[9px] text-text-muted"
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                      <p className="mb-1 text-[12px] leading-[1.5] text-text-muted">
                        <span className="font-mono text-[10px] text-text-muted/50">
                          弧光：
                        </span>
                        {c.arc}
                      </p>
                      <p className="text-[13px] leading-[1.6] text-text">
                        {c.detail}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-6 font-mono text-[11px] text-text-muted transition-colors hover:text-text"
                >
                  + 添加角色
                </button>
              </div>
            </div>
          )}

          {/* 底部状态条（深度专注时隐藏） */}
          {!deepFocus && (
            <div className="flex h-7 flex-shrink-0 items-center justify-between border-t border-border px-5">
              <span className="font-mono text-[10px] text-text-muted">
                自动保存于 2 分钟前
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {wordCount} 字 · 约 {Math.max(1, Math.ceil(wordCount / 300))} 分钟
              </span>
            </div>
          )}
        </div>

        {/* --- 右栏：AI 对话 + 素材抽屉（深度专注时隐藏） --- */}
        {!deepFocus && (
          <aside className="flex w-[280px] flex-shrink-0 flex-col border-l border-border">
            {/* AI 对话区（主常驻，占 60%+） */}
            <div className="flex min-h-[50vh] flex-1 flex-col">
              {/* 对话头 */}
              <div className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border px-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/[0.06]">
                  <span className="font-serif text-[11px] font-semibold text-primary">教</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted">Coach</span>
                <span className="ml-auto font-mono text-[9px] text-text-muted/50">
                  AI 教练
                </span>
              </div>

              {/* 对话消息流 */}
              <div className="flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.role === "coach"
                          ? "border-l-2 border-primary/20 bg-bg-soft/60 px-3 py-2"
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
                            ? "font-serif text-[13px] leading-[1.6] text-text"
                            : "text-[13px] leading-[1.6] text-text-muted"
                        }
                      >
                        {msg.content}
                      </p>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="border-l-2 border-primary/20 bg-bg-soft/60 px-3 py-2">
                      <span className="mb-1 block font-mono text-[9px] text-text-muted/60">
                        教练
                      </span>
                      <span className="font-serif text-[13px] text-text-muted">
                        正在思考…
                      </span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* 输入区（底部边线，无框感） */}
              <div className="flex-shrink-0 border-t border-border px-3 py-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="问教练…"
                    rows={1}
                    className="flex-1 resize-none border-none bg-transparent font-sans text-[13px] text-text outline-none placeholder:text-text-muted/40"
                    style={{ maxHeight: "80px" }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex-shrink-0 rounded-sm bg-primary px-2.5 py-1 font-mono text-[10px] text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>

            {/* 素材库抽屉（折叠态 24px 把手 / 展开态 40%） */}
            <div
              className="flex-shrink-0 border-t border-border transition-all duration-200"
              style={{ height: materialExpanded ? "40%" : "32px" }}
            >
              {/* 把手 */}
              <button
                type="button"
                onClick={handleExpandMaterial}
                className="flex h-8 w-full items-center justify-between px-3 transition-colors hover:bg-bg-soft/40"
              >
                <span className="font-mono text-[10px] text-text-muted">素材库</span>
                <span className="font-mono text-[10px] text-text-muted/50">
                  {materialExpanded ? "▾ 收起" : "▸ 展开"}
                </span>
              </button>

              {/* 素材内容（首次展开才 mount，之后 hidden 保缓存） */}
              {materialMounted && (
                <div
                  className={`overflow-y-auto px-3 pb-3 ${
                    materialExpanded ? "block" : "hidden"
                  }`}
                >
                  {/* 大纲快览 */}
                  <div className="mb-3">
                    <div className="mb-1.5 font-mono text-[9px] text-text-muted/60">
                      大纲
                    </div>
                    <div className="space-y-0.5">
                      {DEMO_OUTLINE.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 py-0.5"
                        >
                          <span
                            className={`font-mono text-[10px] ${
                              item.done ? "text-primary/40" : "text-text-muted/40"
                            }`}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`text-[12px] ${
                              item.done
                                ? "text-text-muted line-through"
                                : "text-text"
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 素材列表 */}
                  <div className="mb-1.5 font-mono text-[9px] text-text-muted/60">
                    情境素材
                  </div>
                  <div className="space-y-1.5">
                    {DEMO_MATERIALS.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-sm border border-border bg-surface px-2 py-1.5 transition-colors hover:border-border-strong"
                      >
                        <div className="mb-0.5 font-mono text-[9px] text-text-muted/50">
                          {m.label}
                        </div>
                        <p className="font-serif text-[11px] leading-[1.5] text-text-muted">
                          {m.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ===== Cmd+K AI 教练 Portal Overlay ===== */}
      {showAIOverlay && (
        <AICoachOverlay
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          isTyping={isTyping}
          onClose={() => setShowAIOverlay(false)}
          chatEndRef={chatEndRef}
        />
      )}

      {/* ===== 深度专注提示 ===== */}
      {deepFocus && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-1.5 shadow-float backdrop-blur-sm">
            <span className="font-mono text-[10px] text-text-muted">深度专注</span>
            <span className="font-mono text-[10px] text-text-muted/40">|</span>
            <kbd className="font-mono text-[10px] text-text-muted">⌘.</kbd>
            <span className="font-mono text-[10px] text-text-muted">退出</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Cmd+K AI 教练 Portal Overlay 组件 =====
function AICoachOverlay({
  messages,
  input,
  setInput,
  onSend,
  isTyping,
  onClose,
  chatEndRef,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isTyping: boolean;
  onClose: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
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
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]" />

      {/* 教练浮窗 */}
      <div
        className="relative flex h-[60vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.06]">
              <span className="font-serif text-xs font-semibold text-primary">教</span>
            </span>
            <span className="font-serif text-sm font-semibold text-text">
              AI 教练
            </span>
            <span className="font-mono text-[9px] text-text-muted/50">Coach</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[10px] text-text-muted hover:text-text"
          >
            ESC 关闭
          </button>
        </div>

        {/* 消息流 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === "coach"
                    ? "border-l-2 border-primary/20 bg-bg-soft/60 px-3 py-2"
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
                      ? "font-serif text-[13px] leading-[1.6] text-text"
                      : "text-[13px] leading-[1.6] text-text-muted"
                  }
                >
                  {msg.content}
                </p>
              </div>
            ))}
            {isTyping && (
              <div className="border-l-2 border-primary/20 bg-bg-soft/60 px-3 py-2">
                <span className="mb-1 block font-mono text-[9px] text-text-muted/60">
                  教练
                </span>
                <span className="font-serif text-[13px] text-text-muted">
                  正在思考…
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* 输入 */}
        <div className="flex-shrink-0 border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="问教练任何关于创作的问题…"
              rows={2}
              autoFocus
              className="flex-1 resize-none border-none bg-transparent font-sans text-[13px] text-text outline-none placeholder:text-text-muted/40"
              style={{ maxHeight: "100px" }}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim()}
              className="flex-shrink-0 rounded-sm bg-primary px-3 py-1.5 font-mono text-[10px] text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
