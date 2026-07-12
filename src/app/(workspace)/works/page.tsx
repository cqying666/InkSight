"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  loadWorks,
  deleteWork,
  type WorkData,
} from "@/lib/write/storage";
import { countWords } from "@/lib/write/stats";
import { trackEvent } from "@/lib/report/analytics";

/**
 * 我的作品页
 *
 * 展示在创作工作台保存的作品。
 * 数据来源：SQLite writing_documents 表 key="works"（WorkData[]）
 */

export default function WorksPage() {
  const [works, setWorks] = useState<WorkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteWork(id);
      setWorks((prev) => prev.filter((w) => w.id !== id));
      trackEvent("work_deleted", { id });
    },
    []
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

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
      <header className="mb-10 flex items-end justify-between border-b border-text/[0.06] pb-6">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/60">
            My Works
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-text">
            我的作品
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            在新建作品页面保存的作品会归档到这里
          </p>
        </div>
        <Link
          href="/write"
          className="flex-shrink-0 rounded-full border border-text/[0.12] px-4 py-2 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary"
        >
          新建作品 →
        </Link>
      </header>

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
      ) : (
        /* 作品列表 */
        <div className="space-y-4">
          {works.map((work) => {
            const wc = countWords(work.plainText);
            const isExpanded = expandedId === work.id;
            const preview = work.plainText.slice(0, 120).trim();
            const dateStr = formatDate(work.completedAt ?? work.savedAt);

            return (
              <article
                key={work.id}
                className="group rounded-sm border border-text/[0.06] bg-surface transition-colors hover:border-text/[0.12]"
              >
                {/* 卡片头部 */}
                <div
                  className="cursor-pointer px-6 py-5"
                  onClick={() => toggleExpand(work.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-serif text-lg font-semibold text-text">
                        {work.title || "无题"}
                      </h2>
                      <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-text-muted tabular-nums">
                        <span>{wc.toLocaleString()} 字</span>
                        <span className="opacity-40">·</span>
                        <span>{dateStr}</span>
                        {work.completedAt && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="text-accent-warm">已完成</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
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
                      <span className="font-mono text-[10px] text-text-muted/40 transition-transform group-hover:text-text-muted">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                    </div>
                  </div>

                  {/* 预览文本 */}
                  {!isExpanded && preview && (
                    <p className="mt-3 line-clamp-2 font-serif text-sm leading-relaxed text-text-muted">
                      {preview}
                      {work.plainText.length > 120 ? "…" : ""}
                    </p>
                  )}
                </div>

                {/* 展开内容 */}
                {isExpanded && (
                  <div className="border-t border-text/[0.06] px-6 py-5">
                    <div
                      className="write-content font-serif text-[15px] leading-[1.9] text-text"
                      dangerouslySetInnerHTML={{ __html: work.html }}
                    />
                    <div className="mt-5 flex items-center gap-3">
                      <Link
                        href="/write"
                        className="rounded-full border border-text/[0.12] px-3 py-1 font-serif text-xs text-text transition-colors hover:border-primary hover:text-primary"
                      >
                        去新建作品编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
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
                        className="rounded-full border border-text/[0.12] px-3 py-1 font-serif text-xs text-text-muted transition-colors hover:border-accent-warm hover:text-accent-warm"
                      >
                        导出 TXT
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
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
