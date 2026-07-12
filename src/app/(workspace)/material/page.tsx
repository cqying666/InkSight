"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  buildIndex,
  search,
  upsertMaterial,
  setTags as storageSetTags,
  setNotes as storageSetNotes,
  setFolder as storageSetFolder,
  listFolders,
  LAYER_LABEL,
  SOURCE_LABEL,
  COMPONENT_KIND_LABEL,
  type Material,
  type ComponentKindValue,
  type MaterialCategory,
  loadAllMaterials,
} from "@/lib/material";
import { trackEvent } from "@/lib/report/analytics";
import { degradeMaterialSearch } from "@/lib/trend";
import { CreateMaterialDialog } from "@/components/material/CreateMaterialDialog";
import { UploadExampleDialog } from "@/components/material/UploadExampleDialog";
import { listExamples, type ExampleSummary } from "@/lib/example";

/**
 * P4-T13 + P4-T14 素材库前端
 *
 * 对齐 PRD §5.6 界面布局：
 *  - 左侧：素材分层导航（原子/组件/灵感）+ 来源筛选 + 文件夹分类 + 我的收藏
 *  - 右侧：搜索框 + 搜索结果列表
 *
 * P4-T14 新增：
 *  - 收藏按钮（持久化到 localStorage）
 *  - 自定义标签（添加/删除）
 *  - 笔记编辑
 *  - 文件夹分类（新建/选择/筛选）
 *
 * 数据源：
 *  - 预置素材 + 拆文自动提取 + 用户收藏（localStorage 合并）
 *  - 用户编辑覆盖 preset/extracted 默认值（按 id upsert）
 *
 * 搜索：TF-IDF 语义搜索（P4-T11）+ 关键词降级（P4-T16）
 */

type MenuKey =
  | "examples"
  | "teardown_summary"
  | "character"
  | "plot"
  | "emotion"
  | "inspiration"
  | "trend";

/** 左侧一级菜单（按用户指定顺序） */
const MENU_ITEMS: { key: MenuKey; label: string }[] = [
  { key: "examples", label: "例文" },
  { key: "teardown_summary", label: "拆文汇总" },
  { key: "character", label: "人设" },
  { key: "plot", label: "剧情" },
  { key: "emotion", label: "情绪描写语录" },
  { key: "inspiration", label: "灵感" },
  { key: "trend", label: "热门元素" },
];

/** 按菜单过滤素材 */
function filterByMenu(materials: Material[], menu: MenuKey): Material[] {
  switch (menu) {
    case "examples":
      return [];
    case "teardown_summary":
      return materials.filter((m) => m.source === "teardown");
    case "character":
      return materials.filter((m) => m.component?.kind === "character_arc");
    case "plot":
      return materials.filter((m) =>
        ["hook", "reversal", "conflict", "plot_template", "dialogue_pattern"].includes(
          m.component?.kind ?? ""
        )
      );
    case "emotion":
      return materials.filter(
        (m) => m.component?.kind === "emotion_curve" || m.layer === "atom"
      );
    case "inspiration":
      return materials.filter((m) => m.layer === "inspiration");
    case "trend":
      return materials.filter((m) => m.source === "trend");
  }
}

export default function MaterialPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [examples, setExamples] = useState<ExampleSummary[]>([]);
  const [examplesError, setExamplesError] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMenu, setActiveMenu] = useState<MenuKey>("examples");
  const [folders, setFolders] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 触发重新加载用户素材的信号（编辑后递增）
  const [userRev, setUserRev] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showUploadExample, setShowUploadExample] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // 初始化：加载预置 + 用户收藏 + 趋势页一键收藏
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [materialsResult, examplesResult] = await Promise.allSettled([
          loadAllMaterials(),
          listExamples(),
        ]);
        if (cancelled) return;
        if (materialsResult.status === "fulfilled") {
          setMaterials(materialsResult.value);
          setFolders(listFolders(materialsResult.value));
        }
        if (examplesResult.status === "fulfilled") {
          setExamples(examplesResult.value);
          setExamplesError(false);
        } else {
          setExamplesError(true);
        }
      } catch {
        // ignore
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userRev]);

  const exampleResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return examples;
    return examples.filter((example) =>
      [
        example.title,
        example.genre,
        ...example.tags,
        ...example.introSentences,
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(normalized)
    );
  }, [examples, query]);

  // 执行菜单过滤 + 搜索（notice/mode 作为派生值返回，避免在 useMemo 中调用 setState）
  const { results: searchResults, notice: searchNotice, mode: searchMode } = useMemo(() => {
    // 先按菜单过滤
    const scoped = filterByMenu(materials, activeMenu);

    let results = scoped;
    let notice: string | null = null;
    let mode: "tfidf" | "keyword" | "empty" = "tfidf";

    // 有搜索词时走 TF-IDF + 降级（在当前菜单范围内搜索）
    if (activeMenu !== "examples" && query.trim()) {
      const scopedIndex = buildIndex(scoped);
      const tfidfResults = search(scopedIndex, query, { topN: 50 });
      const degraded = degradeMaterialSearch(
        tfidfResults,
        scoped,
        query,
        { topN: 50 }
      );

      notice = degraded.notice;
      mode = degraded.mode;
      results = degraded.results.map((r) => r.material);
    }

    return { results, notice, mode };
  }, [query, materials, activeMenu]);

  // 搜索空结果埋点（副作用移到 useEffect，避免在 useMemo 中调用）
  useEffect(() => {
    if (activeMenu !== "examples" && query.trim() && searchMode === "empty") {
      trackEvent("material_searched", {
        source: "search_empty",
        query,
        mode: "empty",
      });
    }
  }, [activeMenu, query, searchMode]);

  // 触发用户素材重载
  const reloadUserMaterials = useCallback(() => {
    setUserRev((n) => n + 1);
  }, []);

  // 收藏切换
  const handleToggleFavorite = useCallback(async (material: Material) => {
    // 必须先 upsert 进 user store（preset/extracted 默认不在 user store 中）
    const updated = await upsertMaterial({ ...material, favorited: !material.favorited });
    if (updated) {
      setMaterials((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? updated : m));
        setFolders(listFolders(next));
        return next;
      });
    }
    if (!material.favorited) {
      trackEvent("material_saved", {
        source: material.source,
        material_type: material.layer,
        tags: material.component?.tags ?? material.atom?.tags ?? material.inspiration?.tags ?? [],
        action: "favorite",
      });
    }
    reloadUserMaterials();
  }, [reloadUserMaterials]);

  // 标签编辑
  const handleSetTags = useCallback(async (material: Material, tags: string[]) => {
    const updated = await upsertMaterial({ ...material, component: material.component ? { ...material.component, tags } : material.component, atom: material.atom ? { ...material.atom, tags } : material.atom, inspiration: material.inspiration ? { ...material.inspiration, tags } : material.inspiration });
    if (updated) {
      await storageSetTags(material.id, tags);
      setMaterials((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? updated : m));
        setFolders(listFolders(next));
        return next;
      });
    }
    reloadUserMaterials();
  }, [reloadUserMaterials]);

  // 笔记编辑
  const handleSetNotes = useCallback(async (material: Material, notes: string) => {
    const updated = await upsertMaterial(material);
    if (updated) {
      await storageSetNotes(material.id, notes);
      setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
    reloadUserMaterials();
  }, [reloadUserMaterials]);

  // 文件夹分配
  const handleSetFolder = useCallback(async (material: Material, folder: string | undefined) => {
    const updated = await upsertMaterial({ ...material, folder });
    if (updated) {
      await storageSetFolder(material.id, folder);
      setMaterials((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? { ...m, folder } : m));
        setFolders(listFolders(next));
        return next;
      });
    }
    reloadUserMaterials();
  }, [reloadUserMaterials]);

  const handleCreateMaterial = useCallback(
    async (material: Material, category: MaterialCategory) => {
      const persisted = await upsertMaterial(material);
      if (!persisted) return false;
      setCreatedId(material.id);
      setActiveMenu(
        category === "character"
          ? "character"
          : category === "plot"
            ? "plot"
            : category === "emotion"
              ? "emotion"
              : "inspiration"
      );
      setShowCreate(false);
      trackEvent("material_saved", {
        source: "manual",
        material_id: material.id,
        category,
      });
      reloadUserMaterials();
      window.setTimeout(() => setCreatedId(null), 3000);
      return true;
    },
    [reloadUserMaterials]
  );

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-sm text-text-muted">加载素材库…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <header className="mb-8 flex items-end justify-between gap-4 border-b border-text/[0.08] pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70">
              Collection
            </p>
            <h1 className="mt-2 font-serif text-title-xl font-medium text-text">
              素材库
            </h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUploadExample(true)}
              className="rounded-full border border-primary px-5 py-2.5 text-sm text-primary transition-transform hover:-translate-y-0.5"
            >
              ＋ 上传例文
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-full bg-primary px-5 py-2.5 text-sm text-text-inverse shadow-card transition-transform hover:-translate-y-0.5"
            >
              ＋ 新建素材
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          {/* 左侧一级菜单 */}
          <aside className="space-y-4">
            <nav className="space-y-1 rounded-2xl border border-text/[0.05] bg-surface p-3 shadow-card">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setActiveMenu(item.key);
                    setQuery("");
                  }}
                  className={`block w-full rounded-lg px-3 py-2 text-left font-serif text-sm transition-colors ${
                    activeMenu === item.key
                      ? "bg-accent/[0.06] text-text font-medium"
                      : "text-text/70 hover:bg-bg/60 hover:text-text"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <section className="rounded-2xl border border-text/[0.05] bg-surface p-4 shadow-card">
              <h3 className="mb-1 text-xs uppercase tracking-wide text-text-muted">数据飞轮</h3>
              <p className="text-xs text-text leading-relaxed">
                拆文越多 → 素材库越丰富 → 创作可用素材越多
              </p>
              <Link
                href="/upload"
                className="mt-3 block text-xs text-accent underline underline-offset-2 hover:text-accent/80"
              >
                上传作品拆解提取素材 →
              </Link>
              <Link
                href="/write"
                className="mt-1 block text-xs text-accent underline underline-offset-2 hover:text-accent/80"
              >
                带着素材去创作 →
              </Link>
            </section>
          </aside>

          {/* 右侧搜索 + 结果 */}
          <div className="space-y-4">
            <section>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeMenu === "examples" ? "搜索书名、导语、题材或标签…" : "输入情境描述或关键词，如「角色发现真相后崩溃的场景」…"}
                  className="w-full rounded-lg border border-text/[0.10] bg-surface px-4 py-2.5 pr-10 text-sm placeholder:text-text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-accent"
                    title="清空搜索"
                  >
                    ✕
                  </button>
                )}
              </div>
              {activeMenu !== "examples" && searchNotice && (
                <div
                  className={`mt-2 rounded-md px-3 py-1.5 text-xs ${
                    searchMode === "keyword"
                      ? "bg-accent/[0.06] text-accent"
                      : "bg-primary/[0.06] text-primary"
                  }`}
                >
                  {searchNotice}
                </div>
              )}
            </section>

            <section className="space-y-4">
              {activeMenu === "examples" ? (
                examplesError ? (
                  <div className="rounded-2xl border border-primary/20 bg-surface p-8 text-center shadow-card">
                    <p className="text-sm text-primary">例文库加载失败，请检查服务后重试。</p>
                    <button
                      type="button"
                      onClick={reloadUserMaterials}
                      className="mt-3 rounded-full border border-primary px-4 py-1.5 text-xs text-primary"
                    >
                      重新加载
                    </button>
                  </div>
                ) : exampleResults.length === 0 ? (
                  <div className="rounded-2xl border border-text/[0.05] bg-surface p-8 text-center shadow-card">
                    <p className="text-sm text-text-muted">
                      {query ? `未找到「${query}」的匹配例文` : "例文库还是空的，上传一篇作品开始积累。"}
                    </p>
                    {!query && (
                      <button
                        type="button"
                        onClick={() => setShowUploadExample(true)}
                        className="mt-3 text-xs text-accent underline underline-offset-2"
                      >
                        上传第一篇例文
                      </button>
                    )}
                  </div>
                ) : (
                  exampleResults.map((example) => <ExampleCard key={example.id} example={example} />)
                )
              ) : searchResults.length === 0 ? (
                <div className="rounded-2xl border border-text/[0.05] bg-surface p-8 text-center shadow-card">
                  <p className="text-sm text-text-muted">
                    {query
                      ? `未找到「${query}」的匹配素材，试试更通用的关键词`
                      : "该分类下暂无素材，上传作品拆解后自动提取"}
                  </p>
                </div>
              ) : (
                searchResults.map((m) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    folders={folders}
                    onToggleFavorite={handleToggleFavorite}
                    onSetTags={handleSetTags}
                    onSetNotes={handleSetNotes}
                    onSetFolder={handleSetFolder}
                    highlighted={createdId === m.id}
                  />
                ))
              )}
            </section>
          </div>
        </div>

        <footer className="mt-10 flex items-center justify-end border-t border-text/[0.06] pt-4 text-xs text-text-muted">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/write"
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              带着素材去创作
            </Link>
            <Link
              href="/trend"
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              查看趋势雷达
            </Link>
            <Link href="/" className="hover:text-text">
              返回首页
            </Link>
          </div>
        </footer>
      </div>
      {showCreate && (
        <CreateMaterialDialog
          folders={folders}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateMaterial}
        />
      )}
      {showUploadExample && (
        <UploadExampleDialog
          onClose={() => setShowUploadExample(false)}
          onSaved={(example) => {
            const { text: _text, paragraphs: _paragraphs, analysis: _analysis, ...summary } = example;
            setExamples((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
            setActiveMenu("examples");
            setQuery("");
            setShowUploadExample(false);
          }}
        />
      )}
    </main>
  );
}

function ExampleCard({ example }: { example: ExampleSummary }) {
  const href =
    example.status === "analyzed"
      ? `/report?exampleId=${encodeURIComponent(example.id)}&tab=original`
      : `/example/${encodeURIComponent(example.id)}`;

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-float"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-accent/[0.07] px-2.5 py-1 text-accent">{example.genre || "待分类"}</span>
            <span className={example.status === "analyzed" ? "text-primary" : "text-text-muted"}>
              {example.status === "analyzed" ? "已拆文" : "仅原文"}
            </span>
          </div>
          <h2 className="mt-3 font-serif text-xl font-semibold text-text group-hover:text-primary">《{example.title}》</h2>
        </div>
        <span className="text-xs text-accent">{example.status === "analyzed" ? "查看 X 光原文 →" : "查看原文 →"}</span>
      </div>

      <div className="mt-4 rounded-xl bg-bg/70 p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-text-muted">导语前三句话</p>
        {example.introSentences.length > 0 ? (
          <ol className="space-y-1.5 font-serif text-sm leading-relaxed text-text/85">
            {example.introSentences.map((sentence, index) => (
              <li key={`${example.id}-${index}`} className="flex gap-2">
                <span className="font-mono text-[10px] text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                <span>{sentence}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-text-muted">原文暂无可展示导语。</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {example.tags.length > 0 ? example.tags.map((tag) => (
          <span key={tag} className="rounded-md border border-text/[0.08] bg-bg px-2 py-0.5 text-[11px] text-text-muted">#{tag}</span>
        )) : (
          <span className="text-[11px] text-text-muted">暂无标签</span>
        )}
      </div>
    </Link>
  );
}

/** 素材卡片（含 P4-T14 收藏/标签/笔记/文件夹） */
interface MaterialCardProps {
  material: Material;
  folders: string[];
  onToggleFavorite: (m: Material) => void;
  onSetTags: (m: Material, tags: string[]) => void;
  onSetNotes: (m: Material, notes: string) => void;
  onSetFolder: (m: Material, folder: string | undefined) => void;
  highlighted?: boolean;
}

function MaterialCard({
  material: m,
  folders,
  onToggleFavorite,
  onSetTags,
  onSetNotes,
  onSetFolder,
  highlighted = false,
}: MaterialCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [notesInput, setNotesInput] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [showFolderEditor, setShowFolderEditor] = useState(false);

  const title = useMemo(() => {
    if (m.atom) return m.atom.text.slice(0, 40);
    if (m.component) return m.component.summary;
    if (m.inspiration) return m.inspiration.title;
    return m.id;
  }, [m]);

  const sourceLabel = m.origin?.title
    ? `来源：《${m.origin.title}》${
        m.origin.type ? ` · ${m.origin.type}` : ""
      }`
    : SOURCE_LABEL[m.source];

  const currentTags = useMemo(() => {
    if (m.atom) return m.atom.tags;
    if (m.component) return m.component.tags;
    if (m.inspiration) return m.inspiration.tags;
    return [];
  }, [m]);

  const currentNotes = useMemo(() => {
    if (m.component?.notes) return m.component.notes;
    if (m.atom && "notes" in m.atom && typeof m.atom.notes === "string") {
      return m.atom.notes;
    }
    if (m.inspiration && "notes" in m.inspiration && typeof m.inspiration.notes === "string") {
      return m.inspiration.notes;
    }
    return "";
  }, [m]);

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t || currentTags.includes(t)) return;
    onSetTags(m, [...currentTags, t]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    onSetTags(m, currentTags.filter((t) => t !== tag));
  };

  const handleSaveNotes = () => {
    onSetNotes(m, notesInput ?? currentNotes);
  };

  const handleCreateFolder = () => {
    const f = folderInput.trim();
    if (!f) return;
    onSetFolder(m, f);
    setFolderInput("");
    setShowFolderEditor(false);
  };

  return (
    <div className={`rounded-2xl border bg-surface p-4 shadow-card transition-all hover:shadow-float ${
      highlighted
        ? "border-primary ring-2 ring-primary/15"
        : m.favorited ? "border-accent/30" : "border-text/[0.05]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-text/[0.08] bg-bg px-2 py-0.5 text-text-muted">
              {LAYER_LABEL[m.layer]}
            </span>
            {m.component && (
              <span className="rounded-md border border-accent/20 bg-accent/[0.06] px-2 py-0.5 text-accent">
                {COMPONENT_KIND_LABEL[m.component.kind]}
              </span>
            )}
            <span className="text-text-muted">{SOURCE_LABEL[m.source]}</span>
            {m.folder && (
              <span className="rounded-md border border-text/[0.08] bg-bg px-2 py-0.5 text-text-muted">
                📁 {m.folder}
              </span>
            )}
          </div>
          <h3 className="mt-2 font-serif text-base font-semibold text-text">
            {title}
          </h3>
          <p className="mt-1 text-xs text-text-muted">{sourceLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* P4-T14 收藏按钮 */}
          <button
            onClick={() => onToggleFavorite(m)}
            className={`rounded-full px-3 py-1.5 text-xs transition-all ${
              m.favorited
                ? "bg-accent text-text-inverse hover:bg-accent/90"
                : "border border-text/[0.10] bg-surface text-text/70 hover:border-accent/30 hover:text-accent"
            }`}
            title={m.favorited ? "取消收藏" : "收藏到个人素材库"}
          >
            {m.favorited ? "★ 已收藏" : "☆ 收藏"}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent underline underline-offset-2 hover:text-accent/80"
          >
            {expanded ? "收起" : "详情"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-text/[0.05] pt-3">
          {/* 内容展示 */}
          {m.atom && (
            <p className="text-sm text-text">{m.atom.text}</p>
          )}
          {m.component && (
            <div className="space-y-2 text-sm">
              {m.component.excerpt && (
                <div>
                  <span className="text-xs text-text-muted">原文摘录：</span>
                  <p className="mt-0.5 text-text italic">
                    「{m.component.excerpt}」
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs text-text-muted">结构详情：</span>
                <ComponentDetails kind={m.component.kind} details={m.component.details} />
              </div>
            </div>
          )}
          {m.inspiration && (
            <div className="space-y-2 text-sm">
              <p className="text-text">{m.inspiration.text}</p>
              {m.inspiration.trendElement && (
                <p className="text-xs text-text-muted">
                  关联趋势元素：{m.inspiration.trendElement}
                </p>
              )}
            </div>
          )}

          {/* P4-T14 标签编辑 */}
          <div className="rounded-xl bg-bg-soft p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-text-muted">标签</div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {currentTags.length === 0 ? (
                <span className="text-xs text-text-muted">暂无标签</span>
              ) : (
                currentTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md border border-text/[0.08] bg-surface px-2 py-0.5 text-xs text-text"
                  >
                    {t}
                    <button
                      onClick={() => handleRemoveTag(t)}
                      className="text-text-muted hover:text-accent"
                      title="删除标签"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                placeholder="添加标签后回车"
                className="flex-1 rounded-md border border-text/[0.10] bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleAddTag}
                className="rounded-md border border-text/[0.10] bg-surface px-2 py-1 text-xs text-text hover:border-accent/30 hover:text-accent"
              >
                添加
              </button>
            </div>
          </div>

          {/* P4-T14 笔记编辑 */}
          <div className="rounded-xl bg-bg-soft p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-text-muted">笔记</div>
            <textarea
              value={notesInput ?? currentNotes}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="写下你对这条素材的笔记或灵感…"
              rows={2}
              className="w-full rounded-md border border-text/[0.10] bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleSaveNotes}
                className="rounded-md bg-primary px-3 py-1 text-xs text-text-inverse hover:bg-primary/90"
              >
                保存笔记
              </button>
            </div>
          </div>

          {/* P4-T14 文件夹分类 */}
          <div className="rounded-xl bg-bg-soft p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-text-muted">文件夹</span>
              <button
                onClick={() => setShowFolderEditor(!showFolderEditor)}
                className="text-xs text-accent underline underline-offset-2 hover:text-accent/80"
              >
                {showFolderEditor ? "取消" : "移动到文件夹"}
              </button>
            </div>
            {m.folder && !showFolderEditor && (
              <p className="text-xs text-text">当前：{m.folder}</p>
            )}
            {showFolderEditor && (
              <div className="space-y-2">
                {folders.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {folders.map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          onSetFolder(m, f);
                          setShowFolderEditor(false);
                        }}
                        className="rounded-md border border-text/[0.08] bg-surface px-2 py-0.5 text-xs text-text hover:border-accent/30 hover:text-accent"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderInput}
                    onChange={(e) => setFolderInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    placeholder="新文件夹名"
                    className="flex-1 rounded-md border border-text/[0.10] bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleCreateFolder}
                    className="rounded-md bg-accent px-3 py-1 text-xs text-text-inverse hover:bg-accent/90"
                  >
                    创建并移动
                  </button>
                </div>
                {m.folder && (
                  <button
                    onClick={() => {
                      onSetFolder(m, undefined);
                      setShowFolderEditor(false);
                    }}
                    className="text-xs text-text-muted underline underline-offset-2 hover:text-accent"
                  >
                    移出文件夹
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 将组件 details 渲染为人类可读的结构化展示，而非原始 JSON */
function ComponentDetails({
  kind,
  details,
}: {
  kind: ComponentKindValue;
  details: Record<string, unknown>;
}) {
  const d = details as Record<string, any>;

  if (kind === "hook") {
    return (
      <dl className="mt-0.5 space-y-1 text-xs text-text">
        <div className="flex gap-2">
          <dt className="text-text-muted">类型</dt>
          <dd>{d.hookTypeLabel || d.hookType}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-muted">强度</dt>
          <dd>{d.hookStrength}/5</dd>
        </div>
        {d.hookAnalysis && (
          <div>
            <dt className="text-text-muted">分析</dt>
            <dd className="mt-0.5 leading-relaxed">{d.hookAnalysis}</dd>
          </div>
        )}
      </dl>
    );
  }

  if (kind === "reversal") {
    const reversals: any[] = Array.isArray(d.reversals) ? d.reversals : [];
    return (
      <div className="mt-0.5 space-y-1.5 text-xs text-text">
        <div className="text-text-muted">共 {d.count || reversals.length} 个反转</div>
        {reversals.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-text-muted">{r.positionPct ?? (r.position * 100).toFixed(0)}%</span>
            <span className="text-primary">{r.typeLabel || r.type}</span>
            <span className="flex-1 text-text">{r.description}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "emotion_curve") {
    const points: any[] = Array.isArray(d.points) ? d.points : [];
    const range = d.range || {};
    return (
      <div className="mt-0.5 space-y-1 text-xs text-text">
        <div className="flex gap-3">
          <span><span className="text-text-muted">形状：</span>{d.shape}</span>
          <span><span className="text-text-muted">峰值：</span>{range.max}</span>
          <span><span className="text-text-muted">谷值：</span>{range.min}</span>
        </div>
        {d.trend && <p className="leading-relaxed text-text">{d.trend}</p>}
        {points.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {points.map((p, i) => (
              <span key={i} className="rounded-sm bg-text px-1 py-0.5">
                {p.positionPct ?? (p.position * 100).toFixed(0)}% {p.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (kind === "character_arc") {
    return (
      <dl className="mt-0.5 space-y-1 text-xs text-text">
        <div><dt className="text-text-muted">渴望</dt><dd className="mt-0.5">{d.desire}</dd></div>
        <div><dt className="text-text-muted">障碍</dt><dd className="mt-0.5">{d.obstacle}</dd></div>
        <div><dt className="text-text-muted">转变</dt><dd className="mt-0.5">{d.change}</dd></div>
        <div className="flex gap-2">
          <dt className="text-text-muted">变化节点</dt>
          <dd>{d.changePointPct ?? (d.changePoint * 100).toFixed(0)}%</dd>
        </div>
      </dl>
    );
  }

  if (kind === "conflict") {
    const dist = d.distribution || {};
    return (
      <div className="mt-0.5 space-y-1.5 text-xs text-text">
        <p><span className="text-text-muted">主导冲突：</span>{d.dominantConflict}</p>
        <div className="flex gap-3">
          {(Object.entries(dist) as [string, number][]).map(([k, v]) => (
            <span key={k}>
              <span className="text-text-muted">{k}</span> {(v * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>
    );
  }

  // 兜底：未知 kind 仍用文本形式展示关键字段
  const entries = Object.entries(d).slice(0, 6);
  return (
    <dl className="mt-0.5 space-y-1 text-xs text-text">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-text-muted">{k}</dt>
          <dd className="flex-1">
            {typeof v === "string" || typeof v === "number"
              ? String(v)
              : Array.isArray(v)
              ? `${v.length} 项`
              : "…"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
