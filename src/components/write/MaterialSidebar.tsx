"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  buildIndex,
  search,
  keywordFallback,
  loadAllMaterials,
  upsertMaterial,
  toggleFavorite,
  LAYER_LABEL,
  COMPONENT_KIND_LABEL,
  type Material,
  type SearchResult,
} from "@/lib/material";
import type { WriteOutline } from "@/lib/write/outline";
import { classifyParagraph, htmlToPlainText } from "@/lib/write/stats";
import { trackEvent } from "@/lib/report/analytics";

/**
 * P5-T6/T7/T8 创作工作台素材侧栏
 *
 * 三个 Tab：
 *  - 推荐 (P5-T6)：情境匹配，根据光标位置（开头段/反转附近/对话密集区）推荐素材
 *  - 搜索 (P5-T7)：手动搜索，原子素材点击插入光标，组件素材展开详情
 *  - 收藏 (P5-T8)：拖拽收藏，选中文本拖入或点击按钮创建原子素材
 *
 * 降级：素材加载失败时显示提示文案，不阻塞写作
 */

interface Props {
  outline?: WriteOutline | null;
}

type Tab = "recommend" | "search" | "collect";

/** 情境类型 */
type ContextType = "opening" | "near_reversal" | "dialogue" | "default";

const CONTEXT_LABEL: Record<ContextType, string> = {
  opening: "开头段",
  near_reversal: "反转附近",
  dialogue: "对话密集区",
  default: "通用",
};

const CONTEXT_QUERY: Record<ContextType, string> = {
  opening: "钩子 开头 悬念",
  near_reversal: "反转 转折 节奏",
  dialogue: "对话 语气 交流",
  default: "场景 情绪 描写",
};

/** 获取编辑器 DOM（复用 WriteAnalysis 的 .write-selector 模式） */
function getEditor(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(".write-editor") as HTMLDivElement | null;
}

export function MaterialSidebar({ outline }: Props) {
  const [tab, setTab] = useState<Tab>("recommend");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  // 触发用户素材重新加载
  const [userRev, setUserRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAllMaterials();
        if (cancelled) return;
        setMaterials(loaded);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userRev]);

  // 索引在 materials 变化时重建
  const index = useMemo(() => buildIndex(materials), [materials]);

  return (
    <div className="flex h-full flex-col rounded-sm border border-accent bg-bg-alt">
      {/* Tab 头 */}
      <div className="flex border-b border-accent">
        {(
          [
            ["recommend", "推荐"],
            ["search", "搜索"],
            ["collect", "收藏"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 px-2 py-2 font-serif text-xs transition-colors ${
              tab === key
                ? "border-b-2 border-primary bg-bg text-primary"
                : "text-text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3">
        {!loaded ? (
          <div className="py-4 text-center text-xs text-text-muted">加载素材…</div>
        ) : error ? (
          <div className="py-4 text-center text-xs text-primary">
            素材库加载异常，请刷新或访问
            <a href="/material" className="text-primary underline"> 素材库页</a>
          </div>
        ) : materials.length === 0 ? (
          <div className="py-4 text-center text-xs text-text-muted">
            暂无素材，先去
            <a href="/material" className="text-primary underline"> 素材库</a>
            收藏一些
          </div>
        ) : tab === "recommend" ? (
          <RecommendTab
            outline={outline}
            materials={materials}
            index={index}
            onRefresh={() => setUserRev((v) => v + 1)}
          />
        ) : tab === "search" ? (
          <SearchTab
            materials={materials}
            index={index}
          />
        ) : (
          <CollectTab
            materials={materials}
            onSaved={() => setUserRev((v) => v + 1)}
          />
        )}
      </div>
    </div>
  );
}

// ===== P5-T6 推荐_tab：情境匹配 =====

function RecommendTab({
  outline,
  materials,
  index,
  onRefresh,
}: {
  outline?: WriteOutline | null;
  materials: Material[];
  index: ReturnType<typeof buildIndex>;
  onRefresh: () => void;
}) {
  const [context, setContext] = useState<ContextType>("default");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [adopted, setAdopted] = useState<Set<string>>(new Set());

  // 检测当前情境
  const detectContext = useCallback((): ContextType => {
    const editor = getEditor();
    if (!editor) return "default";

    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "default";

      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return "default";

      const fullText = htmlToPlainText(editor.innerHTML);
      const totalLen = fullText.length;
      if (totalLen === 0) return "default";

      const preRange = document.createRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.endContainer, range.endOffset);
      const cursorPos = preRange.toString().length / totalLen;

      // 开头段：前 10%
      if (cursorPos < 0.1) return "opening";

      // 反转附近：5% 范围内
      if (outline?.reversals) {
        for (const rev of outline.reversals) {
          if (Math.abs(cursorPos - rev.position) < 0.05) return "near_reversal";
        }
      }

      // 对话密集区：当前段落是对话
      let node: Node | null = range.endContainer;
      while (node && node !== editor) {
        if (node.nodeName === "P") {
          const type = classifyParagraph(node.textContent || "");
          if (type === "dialogue") return "dialogue";
          break;
        }
        node = node.parentNode;
      }

      return "default";
    } catch {
      return "default";
    }
  }, [outline]);

  // 执行推荐搜索
  const refreshRecommend = useCallback(() => {
    const ctx = detectContext();
    setContext(ctx);
    const query = CONTEXT_QUERY[ctx];
    let res = search(index, query, { topN: 6, minScore: 0.01 });

    // 搜索结果不足时，补充未匹配的素材
    if (res.length < 4) {
      const existingIds = new Set(res.map((r) => r.material.id));
      for (const m of materials) {
        if (!existingIds.has(m.id)) {
          res.push({ material: m, score: 0 });
          if (res.length >= 6) break;
        }
      }
    }
    setResults(res);
  }, [detectContext, index, materials]);

  // 初始化 + 情境变化时刷新
  // P6-T9: 改 selectionchange 事件触发（节流 2s），替代 10s 轮询
  // 避免写作时后台一直跑搜索影响输入响应与电池
  useEffect(() => {
    refreshRecommend();

    let lastRun = 0;
    let rafId: number | undefined;
    const throttledRefresh = () => {
      const now = Date.now();
      if (now - lastRun < 2000) return; // 2s 节流
      lastRun = now;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(refreshRecommend);
    };

    document.addEventListener("selectionchange", throttledRefresh);
    return () => {
      document.removeEventListener("selectionchange", throttledRefresh);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [refreshRecommend]);

  const handleAdopt = useCallback(
    (m: Material) => {
      setAdopted((prev) => new Set(prev).add(m.id));
      trackEvent("material_inserted", {
        material_id: m.id,
        layer: m.layer,
        source: m.source,
        context,
      });
    },
    [context]
  );

  const handleToggleFav = useCallback(
    async (m: Material) => {
      // 单请求原子收藏：服务端事务内完成 upsert+toggle，
      // 避免两请求竞态导致预设素材残留进用户库。
      await toggleFavorite(m.id, m);
      onRefresh();
    },
    [onRefresh]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">
          情境：
          <span className="font-medium text-primary">{CONTEXT_LABEL[context]}</span>
        </span>
        <button
          type="button"
          onClick={refreshRecommend}
          className="text-text-muted hover:text-primary"
          title="手动刷新推荐"
        >
          ↻
        </button>
      </div>

      {results.length === 0 ? (
        <div className="py-3 text-center text-xs text-text-muted">
          暂无匹配素材
        </div>
      ) : (
        results.map(({ material: m, score }) => (
          <MaterialCard
            key={m.id}
            material={m}
            score={score}
            adopted={adopted.has(m.id)}
            onAdopt={handleAdopt}
            onToggleFav={handleToggleFav}
          />
        ))
      )}
    </div>
  );
}

// ===== P5-T7 搜索_tab：手动搜索 + 快捷插入 =====

function SearchTab({
  materials,
  index,
}: {
  materials: Material[];
  index: ReturnType<typeof buildIndex>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<"tfidf" | "keyword" | "empty">(
    "empty"
  );
  const [adopted, setAdopted] = useState<Set<string>>(new Set());

  const handleSearch = useCallback(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchMode("empty");
      return;
    }

    let res = search(index, q, { topN: 10, minScore: 0.03 });
    let mode: "tfidf" | "keyword" | "empty";

    if (res.length === 0) {
      // TF-IDF 无结果 → 关键词降级
      res = keywordFallback(materials, q, { topN: 10 });
      mode = res.length > 0 ? "keyword" : "empty";
    } else {
      mode = "tfidf";
    }

    setSearchMode(mode);
    setResults(res);
    trackEvent("material_searched", { from: "write_sidebar_search", query: q, mode });
  }, [query, index, materials]);

  const handleAdopt = useCallback((m: Material) => {
    setAdopted((prev) => new Set(prev).add(m.id));
    trackEvent("material_inserted", {
      material_id: m.id,
      layer: m.layer,
      source: "search",
    });
  }, []);

  return (
    <div className="space-y-2">
      {/* 搜索框 */}
      <div className="flex gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="搜索素材…"
          className="flex-1 rounded-sm border border-accent bg-bg px-2 py-1 text-xs text-text outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="rounded-full border border-primary bg-primary px-2 py-1 text-xs text-inverse hover:bg-primary"
        >
          搜
        </button>
      </div>

      {/* 搜索模式提示 */}
      {searchMode === "keyword" && (
        <div className="text-[10px] text-accent">
          语义搜索无结果，已降级为关键词匹配
        </div>
      )}
      {searchMode === "empty" && query.trim() && (
        <div className="text-[10px] text-text-muted">
          无匹配素材，试试其他关键词
        </div>
      )}

      {/* 结果列表 */}
      {results.map(({ material: m, score }) => (
        <MaterialCard
          key={m.id}
          material={m}
          score={score}
          adopted={adopted.has(m.id)}
          onAdopt={handleAdopt}
        />
      ))}

      {/* 无搜索时展示全部 */}
      {!query.trim() && materials.length > 0 && (
        <div className="py-1 text-[10px] text-text-muted">
          输入关键词搜索，或浏览全部 {materials.length} 条素材
        </div>
      )}
      {!query.trim() &&
        materials.slice(0, 8).map((m) => (
          <MaterialCard
            key={m.id}
            material={m}
            score={0}
            adopted={adopted.has(m.id)}
            onAdopt={handleAdopt}
          />
        ))}
    </div>
  );
}

// ===== P5-T8 收藏_tab：拖拽收藏 =====

function CollectTab({
  materials,
  onSaved,
}: {
  materials: Material[];
  onSaved: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [tags, setTags] = useState("");
  const [manualText, setManualText] = useState("");

  // 从编辑器当前选区获取文本
  const getSelectionText = useCallback((): string => {
    const editor = getEditor();
    if (!editor) return "";

    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return "";

      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return "";

      return sel.toString().trim();
    } catch {
      return "";
    }
  }, []);

  // 创建原子素材
  const createAtom = useCallback(
    async (text: string, tagList: string[]) => {
      if (!text.trim()) return;

      const now = new Date().toISOString();
      const id = `manual-atom-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      await upsertMaterial({
        id,
        layer: "atom",
        source: "manual",
        origin: {
          title: "创作工作台拖拽收藏",
        },
        createdAt: now,
        updatedAt: now,
        userId: "anonymous",
        favorited: true,
        atom: {
          text: text.trim(),
          tags: tagList,
        },
      });

      setSavedCount((c) => c + 1);
      onSaved();
      trackEvent("material_saved", {
        from: "write_sidebar_collect",
        text_length: text.length,
        tags: tagList.length,
      });
    },
    [onSaved]
  );

  // 收藏当前选中文本
  const handleCollectSelection = useCallback(() => {
    const text = getSelectionText();
    if (!text) {
      alert("请先在编辑器中选中要收藏的文字");
      return;
    }
    const tagList = tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    void createAtom(text, tagList);
    setTags("");
  }, [getSelectionText, tags, createAtom]);

  // 手动输入收藏
  const handleCollectManual = useCallback(() => {
    if (!manualText.trim()) return;
    const tagList = tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    void createAtom(manualText, tagList);
    setManualText("");
    setTags("");
  }, [manualText, tags, createAtom]);

  // 拖拽处理
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // 拖拽的文本
      const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
      if (text.trim()) {
        const tagList = tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        void createAtom(text, tagList);
        setTags("");
      }
    },
    [tags, createAtom]
  );

  // 用户已收藏的素材列表
  const favorited = useMemo(
    () => materials.filter((m) => m.favorited),
    [materials]
  );

  return (
    <div className="space-y-3">
      {/* 拖拽收藏区 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-sm border-2 border-dashed p-3 text-center transition-colors ${
          dragOver
            ? "border-primary/[0.16] bg-primary/[0.05]"
            : "border-accent bg-bg"
        }`}
      >
        <div className="text-xs text-text-muted">
          {dragOver ? "松开即可收藏" : "拖拽编辑器中的文字到这里收藏"}
        </div>
        <button
          type="button"
          onClick={handleCollectSelection}
          className="mt-2 w-full rounded-full border border-primary bg-primary px-2 py-1 text-xs text-inverse hover:bg-primary"
        >
          收藏当前选中文字
        </button>
      </div>

      {/* 标签输入 */}
      <div>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签（逗号分隔，可选）"
          className="w-full rounded-sm border border-accent bg-bg px-2 py-1 text-xs text-text outline-none focus:border-primary"
        />
      </div>

      {/* 手动输入收藏 */}
      <div>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="或直接输入要收藏的文字…"
          rows={3}
          className="w-full rounded-sm border border-accent bg-bg px-2 py-1 text-xs text-text outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleCollectManual}
          disabled={!manualText.trim()}
          className="mt-1 w-full rounded-sm border border-accent bg-bg px-2 py-1 text-xs text-accent hover:bg-accent/[0.05] disabled:opacity-40"
        >
          + 添加到素材库
        </button>
      </div>

      {savedCount > 0 && (
        <div className="text-[10px] text-primary">
          已收藏 {savedCount} 条到素材库
        </div>
      )}

      {/* 已收藏列表 */}
      <div className="border-t border-accent pt-2">
        <div className="mb-1 text-[10px] text-text-muted">
          已收藏（{favorited.length}）
        </div>
        {favorited.length === 0 ? (
          <div className="text-[10px] text-text-muted">暂无收藏</div>
        ) : (
          <div className="space-y-1">
            {favorited.slice(0, 10).map((m) => (
              <div
                key={m.id}
                className="rounded-sm border border-accent bg-bg px-2 py-1 text-[11px] text-text"
              >
                {m.atom?.text || m.component?.summary || m.inspiration?.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 共用素材卡片 =====

function MaterialCard({
  material: m,
  score,
  adopted,
  onAdopt,
  onToggleFav,
}: {
  material: Material;
  score: number;
  adopted: boolean;
  onAdopt: (m: Material) => void;
  onToggleFav?: (m: Material) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 插入到光标位置
  const handleInsert = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;

    let textToInsert = "";
    if (m.layer === "atom" && m.atom) {
      textToInsert = m.atom.text;
    } else if (m.layer === "component" && m.component) {
      // 组件素材：展开详情而非直接插入
      setExpanded((v) => !v);
      return;
    } else if (m.layer === "inspiration" && m.inspiration) {
      textToInsert = m.inspiration.text;
    }

    if (!textToInsert) return;

    // 聚焦编辑器并插入文本
    editor.focus();

    // 恢复光标到编辑器内的选区
    const sel = window.getSelection();
    let inserted = false;
    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      // 光标在编辑器内，直接插入
      inserted = document.execCommand("insertText", false, textToInsert);
    } else {
      // 光标不在编辑器内，追加到末尾
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      inserted = document.execCommand("insertText", false, textToInsert);
    }

    if (!inserted) return;
    window.dispatchEvent(new Event("inksight:editor-change"));

    onAdopt(m);
  }, [m, onAdopt]);

  // 展示文本
  const displayText =
    m.layer === "atom"
      ? m.atom?.text
      : m.layer === "component"
      ? m.component?.summary
      : m.inspiration?.title;

  const subLabel =
    m.layer === "component" && m.component
      ? COMPONENT_KIND_LABEL[m.component.kind]
      : m.layer === "inspiration" && m.inspiration
      ? LAYER_LABEL[m.layer]
      : LAYER_LABEL[m.layer];

  return (
    <div className="rounded-sm border border-accent bg-bg px-2 py-1.5 transition-colors hover:border-accent">
      {/* 主行 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-text-muted">{subLabel}</span>
            {score > 0 && (
              <span className="text-[9px] text-accent">
                · {(score * 100).toFixed(0)}%
              </span>
            )}
            {m.favorited && <span className="text-[9px] text-primary">★</span>}
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-text">
            {displayText}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={handleInsert}
            className={`rounded-sm px-1.5 py-0.5 text-[9px] transition-colors ${
              adopted
                ? "bg-accent/[0.08] text-accent"
                : "border border-primary text-primary hover:bg-primary/[0.05]"
            }`}
            title={m.layer === "component" ? "查看详情" : "插入到光标位置"}
          >
            {adopted ? "✓" : m.layer === "component" ? "详情" : "插入"}
          </button>
          {onToggleFav && (
            <button
              type="button"
              onClick={() => onToggleFav(m)}
              className="text-[9px] text-text-muted hover:text-primary"
              title={m.favorited ? "取消收藏" : "收藏"}
            >
              {m.favorited ? "★" : "☆"}
            </button>
          )}
        </div>
      </div>

      {/* 展开详情（组件素材） */}
      {expanded && m.layer === "component" && m.component && (
        <div className="mt-2 space-y-1 border-t border-accent pt-2 text-[10px] text-text-muted">
          {m.component.excerpt && (
            <div>
              <span className="text-text">原文摘录：</span>
              <span className="italic">{m.component.excerpt}</span>
            </div>
          )}
          {m.component.notes && (
            <div>
              <span className="text-text">笔记：</span>
              {m.component.notes}
            </div>
          )}
          {Object.entries(m.component.details || {}).length > 0 && (
            <div>
              <span className="text-text">结构详情：</span>
              <ComponentDetailsText details={m.component.details} />
            </div>
          )}
          {/* 组件素材也提供插入按钮 */}
          <button
            type="button"
            onClick={() => {
              const editor = getEditor();
              if (!editor || !m.component?.summary) return;
              editor.focus();
              const sel = window.getSelection();
              let inserted = false;
              if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                inserted = document.execCommand("insertText", false, `\n【${m.component.summary}】\n`);
              } else {
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
                inserted = document.execCommand("insertText", false, `\n【${m.component.summary}】\n`);
              }
              if (!inserted) return;
              window.dispatchEvent(new Event("inksight:editor-change"));
              onAdopt(m);
            }}
            className="mt-1 rounded-sm border border-primary px-1.5 py-0.5 text-[9px] text-primary hover:bg-primary/[0.05]"
          >
            插入摘要到光标
          </button>
        </div>
      )}

      {/* 灵感素材展开 */}
      {expanded && m.layer === "inspiration" && m.inspiration && (
        <div className="mt-2 space-y-1 border-t border-accent pt-2 text-[10px] text-text-muted">
          <div className="text-text">{m.inspiration.text}</div>
          {m.inspiration.trendElement && (
            <div>
              <span className="text-text">关联趋势：</span>
              {m.inspiration.trendElement}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 将 details 渲染为可读文本列表，避免原始 JSON 暴露给用户 */
function ComponentDetailsText({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).slice(0, 6);
  return (
    <dl className="mt-0.5 space-y-0.5 text-[10px] text-text">
      {entries.map(([k, v]) => {
        let display: string;
        if (typeof v === "string" || typeof v === "number") {
          display = String(v);
        } else if (Array.isArray(v)) {
          display = `${v.length} 项`;
        } else if (v && typeof v === "object") {
          const sub = Object.entries(v as Record<string, unknown>)
            .slice(0, 3)
            .map(([sk, sv]) => `${sk}: ${typeof sv === "string" || typeof sv === "number" ? sv : "…"}`)
            .join("，");
          display = sub || "…";
        } else {
          display = String(v ?? "");
        }
        // 截断过长的值
        if (display.length > 80) display = display.slice(0, 78) + "…";
        return (
          <div key={k} className="flex gap-1">
            <dt className="shrink-0 text-text-muted">{k}</dt>
            <dd className="flex-1">{display}</dd>
          </div>
        );
      })}
    </dl>
  );
}
