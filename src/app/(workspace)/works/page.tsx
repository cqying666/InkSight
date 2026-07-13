"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadWorks,
  deleteWork,
  type WorkData,
} from "@/lib/write/storage";
import { countWords } from "@/lib/write/stats";
import { trackEvent } from "@/lib/report/analytics";
import {
  computeMonthlyStats,
  formatPrice,
  isSold,
  type Sale,
} from "@/lib/write/sale";
import { SaleBadge } from "@/components/works/SaleBadge";
import { MarkSoldSheet } from "@/components/works/MarkSoldSheet";

/**
 * 我的作品页
 *
 * 展示在创作工作台保存的作品。点击卡片跳转到新建作品页编辑该作品。
 * 支持售出管理：标记售出（价格/买家/日期/备注）、筛选 tab、当月统计。
 * 数据来源：SQLite writing_documents 表 key="works"（WorkData[]）
 */

type FilterTab = "all" | "sold" | "unsold";

const TAB_LABELS: Record<FilterTab, string> = {
  all: "全部",
  sold: "已售出",
  unsold: "未售出",
};

export default function WorksPage() {
  const router = useRouter();
  const [works, setWorks] = useState<WorkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  // 标记售出浮层状态
  const [sheetState, setSheetState] = useState<{
    open: boolean;
    workId: string;
    workTitle: string;
    wordCount: number;
    initialSale?: Sale;
  }>({ open: false, workId: "", workTitle: "", wordCount: 0 });

  const reloadWorks = useCallback(async () => {
    const data = await loadWorks();
    setWorks(data);
  }, []);

  useEffect(() => {
    trackEvent("works_viewed", {});
    let cancelled = false;
    (async () => {
      const data = await loadWorks();
      if (cancelled) return;
      setWorks(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => computeMonthlyStats(works), [works]);

  const filteredWorks = useMemo(() => {
    if (filter === "sold") return works.filter((w) => isSold(w.sale));
    if (filter === "unsold") return works.filter((w) => !isSold(w.sale));
    return works;
  }, [works, filter]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteWork(id);
      setWorks((prev) => prev.filter((w) => w.id !== id));
      trackEvent("work_deleted", { id });
    },
    []
  );

  const handleOpen = useCallback(
    (id: string) => {
      trackEvent("work_opened", { id });
      router.push(`/write?id=${encodeURIComponent(id)}`);
    },
    [router]
  );

  const openMarkSold = useCallback((work: WorkData) => {
    setSheetState({
      open: true,
      workId: work.id,
      workTitle: work.title || "无题",
      wordCount: countWords(work.plainText),
      initialSale: work.sale,
    });
  }, []);

  const closeMarkSold = useCallback(() => {
    setSheetState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSaved = useCallback(() => {
    void reloadWorks();
  }, [reloadWorks]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-text-muted">加载作品…</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {/* 页头 */}
      <header className="mb-8 flex items-end justify-between border-b border-text/[0.06] pb-6">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/60">
            My Works
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-text">
            我的作品
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            点击作品卡片继续编辑，标记售出后可统计收入
          </p>
        </div>
        <Link
          href="/write"
          className="flex-shrink-0 rounded-full border border-text/[0.12] px-4 py-2 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary"
        >
          新建作品 →
        </Link>
      </header>

      {/* 统计概览：三列 Metric 卡片 */}
      <section className="mb-8 grid grid-cols-3 gap-4">
        <MetricCard
          label="当月售出金额"
          value={formatPrice(stats.monthlyRevenue)}
          accent
        />
        <MetricCard
          label="当月售出篇数"
          value={`${stats.monthlyCount} 篇`}
        />
        <MetricCard
          label="累计作品"
          value={`${stats.totalCount} 篇`}
          subline={`已售出 ${stats.soldCount} · 未售出 ${stats.unsoldCount}`}
        />
      </section>

      {/* 筛选 Tab */}
      <div className="mb-4 flex items-center gap-1 border-b border-text/[0.06]">
        {(["all", "sold", "unsold"] as FilterTab[]).map((tab) => {
          const count =
            tab === "all"
              ? stats.totalCount
              : tab === "sold"
                ? stats.soldCount
                : stats.unsoldCount;
          const active = filter === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`relative px-3 py-2 font-serif text-sm transition-colors ${
                active
                  ? "text-text"
                  : "text-text-muted hover:text-text/80"
              }`}
            >
              {TAB_LABELS[tab]}
              <span className="ml-1.5 font-mono text-[10px] tabular-nums text-text-muted/60">
                {count}
              </span>
              {active && (
                <span className="absolute bottom-0 left-0 h-[2px] w-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* 空状态 */}
      {works.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-text/[0.06] bg-bg-alt">
            <span className="font-serif text-2xl text-text-muted/40">空</span>
          </div>
          <div>
            <p className="font-serif text-base text-text">还没有作品</p>
            <p className="mt-1 text-xs text-text-muted">
              去新建作品写下第一篇，保存后它会出现在这里
            </p>
          </div>
          <Link
            href="/write"
            className="mt-2 rounded-full bg-primary px-5 py-2 font-serif text-xs text-text-inverse transition-opacity hover:opacity-90"
          >
            开始写作
          </Link>
        </div>
      ) : filteredWorks.length === 0 ? (
        /* 某个筛选 tab 下无作品 */
        <div className="flex min-h-[20vh] items-center justify-center">
          <p className="font-serif text-sm text-text-muted">
            该分类下暂无作品
          </p>
        </div>
      ) : (
        /* 作品列表 */
        <div className="space-y-3">
          {filteredWorks.map((work) => {
            const wc = countWords(work.plainText);
            const preview = work.plainText.slice(0, 120).trim();
            const dateStr = formatDate(work.completedAt ?? work.savedAt);
            const sold = isSold(work.sale);

            return (
              <article
                key={work.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(work.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpen(work.id);
                  }
                }}
                className="group cursor-pointer rounded-sm border border-text/[0.06] bg-surface transition-colors hover:border-text/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <div className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* 标题行 + 售出徽章 */}
                      <div className="flex items-center gap-2.5">
                        <SaleBadge sale={work.sale} compact />
                        <h2 className="min-w-0 truncate font-serif text-lg font-semibold text-text">
                          {work.title || "无题"}
                        </h2>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-text-muted tabular-nums">
                        <span>{wc.toLocaleString()} 字</span>
                        <span className="opacity-40">·</span>
                        <span>{dateStr}</span>
                        {sold && work.sale?.buyer && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="text-accent-warm">
                              {work.sale.buyer}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {/* 标记售出 / 修改售出 图标按钮 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMarkSold(work);
                        }}
                        title={sold ? "修改售出信息" : "标记售出"}
                        aria-label={sold ? "修改售出信息" : "标记售出"}
                        className={`flex h-7 w-7 items-center justify-center rounded-sm font-serif text-xs transition-colors ${
                          sold
                            ? "text-accent hover:bg-accent/[0.06]"
                            : "text-text-muted/50 hover:bg-bg-soft hover:text-accent"
                        }`}
                      >
                        ¥
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const blob = new Blob([work.plainText], {
                            type: "text/plain;charset=utf-8",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${work.title || "无题"}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          trackEvent("work_exported", { id: work.id });
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted/40 transition-colors hover:bg-bg-soft hover:text-accent-warm"
                        title="导出 TXT"
                        aria-label="导出 TXT"
                      >
                        <span className="text-xs">↓</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(work.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted/40 transition-colors hover:bg-bg-soft hover:text-primary"
                        title="删除作品"
                        aria-label="删除作品"
                      >
                        <span className="text-xs">✕</span>
                      </button>
                      <span className="ml-1 font-mono text-[10px] text-text-muted/40 transition-transform group-hover:text-accent-warm">
                        →
                      </span>
                    </div>
                  </div>

                  {/* 预览文本 */}
                  {preview && (
                    <p className="mt-3 line-clamp-2 font-serif text-sm leading-relaxed text-text-muted">
                      {preview}
                      {work.plainText.length > 120 ? "…" : ""}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 标记售出浮层 */}
      <MarkSoldSheet
        workId={sheetState.workId}
        workTitle={sheetState.workTitle}
        wordCount={sheetState.wordCount}
        initialSale={sheetState.initialSale}
        open={sheetState.open}
        onClose={closeMarkSold}
        onSaved={handleSaved}
      />
    </main>
  );
}

/** 三列统计卡片 */
function MetricCard({
  label,
  value,
  subline,
  accent = false,
}: {
  label: string;
  value: string;
  subline?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-sm border border-text/[0.06] bg-surface px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/60">
        {label}
      </div>
      <div
        className={`mt-1.5 font-serif text-3xl font-bold tabular-nums ${
          accent ? "text-accent" : "text-text"
        }`}
      >
        {value}
      </div>
      {subline && (
        <div className="mt-1 font-mono text-[10px] text-text-muted/70">
          {subline}
        </div>
      )}
    </div>
  );
}

/** 格式化日期为「YYYY-MM-DD HH:mm」 */
function formatDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
