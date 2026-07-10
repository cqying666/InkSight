"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  mockCollectSnapshots,
  mockCollectMultiDay,
  computeLifecycle,
  computeDirection,
  buildElementSeries,
  PLATFORM_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_ADVICE,
  type PlatformValue,
  type TrendSnapshotValue,
  type LifecycleStageValue,
  type HeatmapCellValue,
  type TrendEntryValue,
} from "@/lib/trend";
import { upsertMaterial, type Material } from "@/lib/material";
import { ModuleRating } from "@/components/report/ModuleRating";
import { trackEvent } from "@/lib/report/analytics";
import { useUserProfile } from "@/lib/report/use-user-profile";

const PLATFORMS: PlatformValue[] = ["fanqie", "zhihu", "qimao", "dianzhong"];

type TimeRange = "today" | "7d" | "30d";

const TYPE_TO_FOCUS_ELEMENT: Record<string, string> = {
  "plot-driven": "反转",
  "emotion-driven": "虐心",
  "atmosphere-driven": "日常",
  mixed: "反转",
};

const TYPE_LABEL_SHORT: Record<string, string> = {
  "plot-driven": "情节驱动",
  "emotion-driven": "情感驱动",
  "atmosphere-driven": "氛围驱动",
  mixed: "混合型",
};

interface SelectedElement {
  name: string;
  kind: "genre" | "element";
  relatedGenre?: string;
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";

export default function TrendPage() {
  const [snapshots, setSnapshots] = useState<TrendSnapshotValue[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformValue>>(
    new Set(PLATFORMS)
  );
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [focusElement, setFocusElement] = useState<string>("反转");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const profile = useUserProfile();
  const personalizedHint = profile?.preferredType
    ? TYPE_TO_FOCUS_ELEMENT[profile.preferredType] ?? null
    : null;
  const hasPersonalized = !!personalizedHint && profile !== null;

  useEffect(() => {
    if (profile?.preferredType && TYPE_TO_FOCUS_ELEMENT[profile.preferredType]) {
      setFocusElement(TYPE_TO_FOCUS_ELEMENT[profile.preferredType]!);
    }
  }, [profile?.preferredType]);

  useEffect(() => {
    const days = timeRange === "today" ? 1 : timeRange === "7d" ? 7 : 30;
    const snaps =
      days === 1
        ? mockCollectSnapshots({ entriesPerPlatform: 12 })
        : mockCollectMultiDay(days, { entriesPerPlatform: 8 }).filter(
            (s, i, arr) =>
              i === 0 || s.date !== arr[i - 1].date || s.platform !== arr[i - 1].platform
          );

    setSnapshots(snaps);
    setLoaded(true);
    trackEvent("trend_viewed", {
      platform_filter: Array.from(selectedPlatforms).join(","),
      time_range: timeRange,
      elements_clicked: focusElement,
      personalized: hasPersonalized,
      user_preferred_type: profile?.preferredType ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const filteredSnapshots = useMemo(
    () => snapshots.filter((s) => selectedPlatforms.has(s.platform)),
    [snapshots, selectedPlatforms]
  );

  const { heatmap, genres, elements, maxHeat } = useMemo(() => {
    const cellMap = new Map<string, HeatmapCellValue>();
    const genreSet = new Set<string>();
    const elementSet = new Set<string>();
    let maxH = 0;

    for (const snap of filteredSnapshots) {
      for (const cell of snap.heatmap) {
        const key = `${cell.genre}|${cell.element}`;
        const existing = cellMap.get(key);
        if (existing) {
          existing.heat += cell.heat;
          existing.count += cell.count;
        } else {
          cellMap.set(key, { ...cell });
        }
        const h = existing?.heat ?? cell.heat;
        if (h > maxH) maxH = h;
        genreSet.add(cell.genre);
        elementSet.add(cell.element);
      }
    }

    return {
      heatmap: Array.from(cellMap.values()).sort((a, b) => b.heat - a.heat),
      genres: Array.from(genreSet).sort(),
      elements: Array.from(elementSet).sort(),
      maxHeat: maxH,
    };
  }, [filteredSnapshots]);

  const lifecycleBoard = useMemo(() => {
    const board: Record<LifecycleStageValue, string[]> = {
      emerging: [],
      exploding: [],
      plateau: [],
      declining: [],
    };

    for (const genre of genres) {
      const series = buildElementSeries(filteredSnapshots, genre, "genre");
      if (series.length < 2) continue;
      const stage = computeLifecycle(series);
      board[stage].push(genre);
    }

    return board;
  }, [filteredSnapshots, genres]);

  const recommendations = useMemo(() => {
    return heatmap.slice(0, 3).map((cell, idx) => ({
      id: `combo-${idx}`,
      name: `${cell.genre}+${cell.element}`,
      parts: [cell.genre, cell.element],
      heat: cell.heat,
      direction: computeDirection(
        buildElementSeries(filteredSnapshots, cell.element, "element")
      ),
      lifecycle: computeLifecycle(
        buildElementSeries(filteredSnapshots, cell.genre, "genre")
      ),
      count: cell.count,
    }));
  }, [heatmap, filteredSnapshots]);

  const togglePlatform = (p: PlatformValue) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const heatStyle = (heat: number) => {
    if (maxHeat === 0) return { bg: "bg-data-heat1", text: "text-text" };
    const ratio = heat / maxHeat;
    if (ratio >= 0.8) return { bg: "bg-data-heat5", text: "text-text-inverse" };
    if (ratio >= 0.6) return { bg: "bg-data-heat4", text: "text-text-inverse" };
    if (ratio >= 0.4) return { bg: "bg-data-heat3", text: "text-text" };
    if (ratio >= 0.2) return { bg: "bg-data-heat2", text: "text-text" };
    return { bg: "bg-data-heat1", text: "text-text" };
  };

  const handleCellClick = (genre: string, element: string) => {
    setSelected({ name: element, kind: "element", relatedGenre: genre });
    setSaveNotice(null);
    trackEvent("trend_element_saved", {
      element,
      related_genre: genre,
      action: "view_detail",
    });
  };

  const handleGenreClick = (genre: string) => {
    setSelected({ name: genre, kind: "genre" });
    setSaveNotice(null);
    trackEvent("trend_element_saved", {
      element: genre,
      action: "view_detail",
    });
  };

  const handleElementClick = (element: string) => {
    setSelected({ name: element, kind: "element" });
    setSaveNotice(null);
    trackEvent("trend_element_saved", {
      element,
      action: "view_detail",
    });
  };

  const handleSaveToMaterial = useCallback(() => {
    if (!selected) return;
    const now = new Date().toISOString();
    const topWorks = getRepresentativeWorks(filteredSnapshots, selected.name, selected.kind);
    const top = topWorks[0];
    const material: Material = {
      id: `trend-${selected.kind}-${selected.name}-${Date.now()}`,
      layer: "inspiration",
      source: "trend",
      origin: top
        ? {
            title: top.title,
            platform: top.platform,
            rank: top.rank,
            popularity: top.popularity,
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
      userId: "anonymous",
      favorited: true,
      inspiration: {
        title: `趋势元素：${selected.name}`,
        text: buildInspirationText(selected, filteredSnapshots),
        kind: "other",
        trendElement: selected.name,
        tags: [selected.kind === "genre" ? "题材" : "元素", "趋势收藏"],
      },
    };
    upsertMaterial(material);
    setSaveNotice(`已收藏到素材库灵感层：${selected.name}`);
    trackEvent("trend_element_saved", {
      element: selected.name,
      kind: selected.kind,
      action: "save_to_material",
    });
  }, [selected, filteredSnapshots]);

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-sm text-text-muted">加载趋势数据…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <header className="mb-8 border-b border-text/[0.08] pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70">
            Trend Radar
          </p>
          <h1 className="mt-2 font-serif text-title-xl font-medium text-text">
            趋势热力图
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            题材 × 元素矩阵，看清风口与入场时机。点击单元格查看元素详情卡。
            数据源：mock（真实采集待合规评估）
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-xs uppercase tracking-wide text-text-muted">
                平台筛选
              </h2>
              <div className="space-y-2">
                {PLATFORMS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 text-sm text-text cursor-pointer leading-relaxed"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.has(p)}
                      onChange={() => togglePlatform(p)}
                      className="accent-accent h-3.5 w-3.5"
                    />
                    {PLATFORM_LABEL[p]}
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-xs uppercase tracking-wide text-text-muted">
                时间范围
              </h2>
              <div className="space-y-2">
                {(
                  [
                    { v: "today", l: "今天" },
                    { v: "7d", l: "近 7 天" },
                    { v: "30d", l: "近 30 天" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.v}
                    className="flex items-center gap-2 text-sm text-text cursor-pointer leading-relaxed"
                  >
                    <input
                      type="radio"
                      name="timeRange"
                      checked={timeRange === opt.v}
                      onChange={() => setTimeRange(opt.v)}
                      className="accent-accent h-3.5 w-3.5"
                    />
                    {opt.l}
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-xs uppercase tracking-wide text-text-muted">
                我的关注
              </h2>
              <input
                type="text"
                value={focusElement}
                onChange={(e) => setFocusElement(e.target.value)}
                placeholder="输入关注元素…"
                className={`w-full rounded-md border border-text/[0.10] bg-bg px-3 py-2 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${focusRing}`}
              />
              {hasPersonalized && personalizedHint && profile?.preferredType ? (
                <p className="mt-2 text-xs text-accent">
                  基于你的{TYPE_LABEL_SHORT[profile.preferredType] || ""}拆文偏好推荐「{personalizedHint}」
                </p>
              ) : (
                <p className="mt-2 text-xs text-text-muted">点击热力图单元格查看详情</p>
              )}
            </section>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              {heatmap.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">
                  当前筛选条件下无数据
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2"></th>
                        {elements.map((el) => (
                          <th
                            key={el}
                            className="p-2 text-xs font-normal text-text-muted"
                          >
                            <button
                              onClick={() => handleElementClick(el)}
                              className={`text-text underline decoration-dotted decoration-accent/40 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent ${focusRing} rounded-sm`}
                              title="点击查看元素详情"
                            >
                              {el}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {genres.map((genre) => (
                        <tr key={genre}>
                          <td className="p-2 text-xs text-text">
                            <button
                              onClick={() => handleGenreClick(genre)}
                              className={`text-text underline decoration-dotted decoration-accent/40 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent ${focusRing} rounded-sm`}
                              title="点击查看题材详情"
                            >
                              {genre}
                            </button>
                          </td>
                          {elements.map((el) => {
                            const cell = heatmap.find(
                              (c) => c.genre === genre && c.element === el
                            );
                            const style = cell ? heatStyle(cell.heat) : null;
                            return (
                              <td key={el} className="p-1">
                                {cell && style ? (
                                  <button
                                    onClick={() => handleCellClick(genre, el)}
                                    className={`h-10 w-14 rounded-md ${style.bg} ${style.text} flex items-center justify-center text-[10px] font-medium transition-all hover:ring-2 hover:ring-accent hover:ring-offset-1 hover:scale-105 ${focusRing}`}
                                    title={`${genre}+${el}: 热度 ${Math.round(
                                      cell.heat
                                    )}，${cell.count} 篇（点击查看详情）`}
                                  >
                                    {cell.count}
                                  </button>
                                ) : (
                                  <div className="h-10 w-14 rounded-md bg-data-heat1 border border-text/[0.04]"></div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                    <span>热度：</span>
                    {[
                      { label: "极高", cls: "bg-data-heat5", text: "text-text-inverse" },
                      { label: "高", cls: "bg-data-heat4", text: "text-text-inverse" },
                      { label: "中", cls: "bg-data-heat3", text: "text-text" },
                      { label: "低", cls: "bg-data-heat2", text: "text-text" },
                      { label: "无", cls: "bg-data-heat1", text: "text-text" },
                    ].map((item) => (
                      <span key={item.label} className="flex items-center gap-1">
                        <span className={`inline-block h-3.5 w-3.5 rounded-sm border border-text/[0.04] ${item.cls}`}></span>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {selected && (
              <ElementDetailCard
                selected={selected}
                snapshots={filteredSnapshots}
                onClose={() => {
                  setSelected(null);
                  setSaveNotice(null);
                }}
                onSave={handleSaveToMaterial}
                saveNotice={saveNotice}
              />
            )}

            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              <h2 className="mb-3 font-serif text-xl font-medium text-text">
                推荐元素组合
              </h2>
              {recommendations.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-muted">暂无推荐</p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between border-b border-accent/20 pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <div className="font-serif text-base font-semibold text-text">
                          {r.name}
                        </div>
                        <div className="text-xs text-text-muted tabular-nums">
                          {r.count} 篇 · 热度 {Math.round(r.heat)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className={
                            r.direction === "rising"
                              ? "text-accent font-medium"
                              : r.direction === "falling"
                              ? "text-text-muted"
                              : "text-accent-warm"
                          }
                        >
                          {r.direction === "rising"
                            ? "↑"
                            : r.direction === "falling"
                            ? "↓"
                            : "→"}{" "}
                          {LIFECYCLE_LABEL[r.lifecycle]}
                        </span>
                        <span className="text-text-muted hidden sm:inline">
                          {LIFECYCLE_ADVICE[r.lifecycle]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card">
              <h2 className="mb-3 font-serif text-xl font-medium text-text">
                生命周期看板
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  ["emerging", "exploding", "plateau", "declining"] as const
                ).map((stage) => (
                  <div
                    key={stage}
                    className={`rounded-xl border p-3 transition-shadow hover:shadow-card ${
                      stage === "emerging"
                        ? "border-accent/20 bg-accent/[0.04]"
                        : stage === "exploding"
                        ? "border-primary/20 bg-primary/[0.04]"
                        : stage === "plateau"
                        ? "border-text/[0.06] bg-bg-soft"
                        : "border-text/[0.06] bg-surface"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-wide text-text-muted">
                      {LIFECYCLE_LABEL[stage]}
                    </div>
                    <div className="mt-2 space-y-1">
                      {lifecycleBoard[stage].length === 0 ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : (
                        lifecycleBoard[stage].map((g) => (
                          <button
                            key={g}
                            onClick={() => handleGenreClick(g)}
                            className={`block text-left text-sm text-text underline decoration-dotted decoration-accent/40 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary ${focusRing} rounded-sm`}
                          >
                            {g}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-10 flex items-center justify-between border-t border-text/[0.06] pt-4 text-xs text-text-muted">
          <span>InkSight · 热门元素雷达（mock 数据）</span>
          <div className="flex gap-3">
            <Link
              href="/material"
              className={`text-accent underline underline-offset-2 hover:text-accent/80 ${focusRing} rounded-sm`}
            >
              进入素材库
            </Link>
            <Link href="/" className={`hover:text-text transition-colors ${focusRing} rounded-sm`}>
              返回首页
            </Link>
          </div>
        </footer>

        <ModuleRating module="trend" moduleLabel="趋势雷达" />
      </div>
    </main>
  );
}

interface ElementDetailCardProps {
  selected: SelectedElement;
  snapshots: TrendSnapshotValue[];
  onClose: () => void;
  onSave: () => void;
  saveNotice: string | null;
}

function ElementDetailCard({
  selected,
  snapshots,
  onClose,
  onSave,
  saveNotice,
}: ElementDetailCardProps) {
  const series = useMemo(
    () => buildElementSeries(snapshots, selected.name, selected.kind),
    [snapshots, selected]
  );

  const lifecycle = useMemo(
    () => computeLifecycle(series),
    [series]
  );

  const direction = useMemo(
    () => computeDirection(series),
    [series]
  );

  const platformDist = useMemo(() => {
    const dist: Record<PlatformValue, number> = {
      fanqie: 0,
      zhihu: 0,
      qimao: 0,
      dianzhong: 0,
    };
    for (const snap of snapshots) {
      for (const cell of snap.heatmap) {
        const match =
          (selected.kind === "genre" && cell.genre === selected.name) ||
          (selected.kind === "element" && cell.element === selected.name);
        if (match) {
          dist[snap.platform] += cell.heat;
        }
      }
    }
    const total = Object.values(dist).reduce((s, v) => s + v, 0);
    return {
      dist,
      total,
      percents: Object.fromEntries(
        Object.entries(dist).map(([k, v]) => [
          k,
          total > 0 ? (v / total) * 100 : 0,
        ])
      ) as Record<PlatformValue, number>,
    };
  }, [snapshots, selected]);

  const topCombinations = useMemo(() => {
    const comboMap = new Map<string, { name: string; kind: "genre" | "element"; heat: number; count: number }>();
    for (const snap of snapshots) {
      for (const cell of snap.heatmap) {
        const isGenreMatch =
          selected.kind === "genre" && cell.genre === selected.name;
        const isElementMatch =
          selected.kind === "element" && cell.element === selected.name;
        if (!isGenreMatch && !isElementMatch) continue;
        const partnerName = selected.kind === "genre" ? cell.element : cell.genre;
        const partnerKind = selected.kind === "genre" ? "element" : "genre";
        const key = `${partnerKind}|${partnerName}`;
        const existing = comboMap.get(key);
        if (existing) {
          existing.heat += cell.heat;
          existing.count += cell.count;
        } else {
          comboMap.set(key, { name: partnerName, kind: partnerKind, heat: cell.heat, count: cell.count });
        }
      }
    }
    return Array.from(comboMap.values())
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 5);
  }, [snapshots, selected]);

  const representatives = useMemo(
    () => getRepresentativeWorks(snapshots, selected.name, selected.kind).slice(0, 3),
    [snapshots, selected]
  );

  const structureSummary = useMemo(
    () => buildStructureSummary(selected.name, selected.kind, lifecycle),
    [selected, lifecycle]
  );

  const trendPoints = series.slice(-30);

  return (
    <section className="rounded-2xl border border-accent/20 bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">
            {selected.kind === "genre" ? "题材" : "元素"}详情
          </div>
          <h2 className="mt-1 font-serif text-2xl font-medium text-text">
            {selected.name}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="text-accent font-medium">
              {LIFECYCLE_LABEL[lifecycle]} ·{" "}
              {direction === "rising" ? "↑ 上升" : direction === "falling" ? "↓ 下降" : "→ 平稳"}
            </span>
            <span className="text-text-muted">
              {LIFECYCLE_ADVICE[lifecycle]}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className={`rounded-md border border-accent/40 px-2.5 py-1 text-xs text-text transition-all hover:border-primary hover:text-primary ${focusRing}`}
        >
          关闭 ×
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-text/[0.05] bg-bg p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            热度走势（近 {trendPoints.length} 天）
          </div>
          <TrendChart points={trendPoints} />
          <div className="mt-2 flex items-center justify-between text-xs text-text-muted tabular-nums">
            <span>总热度 {Math.round(trendPoints.reduce((s, p) => s + p.heat, 0))}</span>
            <span>峰值 {Math.round(Math.max(...trendPoints.map((p) => p.heat), 0))}</span>
          </div>
        </div>

        <div className="rounded-xl border border-text/[0.05] bg-bg p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            跨平台分布
          </div>
          <div className="space-y-1.5">
            {PLATFORMS.map((p) => {
              const pct = platformDist.percents[p];
              const heat = platformDist.dist[p];
              return (
                <div key={p} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-text">
                    {PLATFORM_LABEL[p]}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-sm bg-text/10">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    ></div>
                  </div>
                  <span className="w-12 text-right text-xs text-text-muted tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="w-16 text-right text-xs text-text tabular-nums">
                    {Math.round(heat)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-text/[0.05] bg-bg p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            常见搭配 Top 5
          </div>
          {topCombinations.length === 0 ? (
            <p className="text-xs text-text-muted">暂无搭配数据</p>
          ) : (
            <div className="space-y-1.5">
              {topCombinations.map((c, idx) => (
                <div key={`${c.kind}-${c.name}`} className="flex items-center gap-2">
                  <span className="w-4 text-xs text-text-muted tabular-nums">{idx + 1}.</span>
                  <span className="flex-1 text-sm text-text">
                    {selected.name} + {c.name}
                    <span className="ml-1 text-xs text-text-muted">
                      ({c.kind === "genre" ? "题材" : "元素"})
                    </span>
                  </span>
                  <span className="text-xs text-text-muted tabular-nums">
                    {c.count} 篇 · {Math.round(c.heat)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-text/[0.05] bg-bg p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            代表结构模式
          </div>
          <p className="text-xs text-text leading-relaxed">
            {structureSummary}
          </p>
          <div className="mt-3 mb-1 text-xs uppercase tracking-wide text-text-muted">
            代表作 Top 3
          </div>
          {representatives.length === 0 ? (
            <p className="text-xs text-text-muted">暂无代表作数据</p>
          ) : (
            <ul className="space-y-1">
              {representatives.map((w, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs">
                  <span className="text-text">
                    #{w.rank ?? idx + 1} 《{w.title}》
                  </span>
                  <span className="text-text-muted">
                    {PLATFORM_LABEL[w.platform]}
                    {w.popularity ? ` · ${Math.round(w.popularity)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-text/[0.06] pt-3">
        <div className="text-xs text-text-muted">
          收藏后将进入素材库「灵感素材」层，标注来源趋势元素
        </div>
        <div className="flex items-center gap-3">
          {saveNotice && (
            <Link
              href="/material"
              className={`text-xs text-accent underline underline-offset-2 hover:text-accent/80 ${focusRing} rounded-sm`}
            >
              ✓ {saveNotice} · 去素材库查看 →
            </Link>
          )}
          <button
            onClick={onSave}
            className={`rounded-full bg-accent px-4 py-1.5 text-sm text-inverse transition-all hover:bg-accent/90 hover:shadow-md ${focusRing}`}
          >
            ★ 一键收藏到素材库
          </button>
        </div>
      </div>
    </section>
  );
}

function TrendChart({
  points,
}: {
  points: { date: string; heat: number; count: number }[];
}) {
  if (points.length === 0) {
    return <div className="py-4 text-center text-xs text-text-muted">无走势数据</div>;
  }
  const W = 280;
  const H = 80;
  const pad = 4;
  const heats = points.map((p) => p.heat);
  const maxHeat = Math.max(...heats, 1);
  const minHeat = Math.min(...heats, 0);
  const range = maxHeat - minHeat || 1;

  const stepX = (W - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((p.heat - minHeat) / range) * (H - pad * 2);
    return { x, y };
  });

  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height: 80 }}
    >
      <line
        x1={pad}
        y1={H - pad}
        x2={W - pad}
        y2={H - pad}
        stroke="#1C1C1E"
        strokeOpacity="0.1"
        strokeWidth="1"
      />
      <path d={pathD} fill="none" stroke="#9C4B3C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2" fill="#9C4B3C" />
      ))}
    </svg>
  );
}

function getRepresentativeWorks(
  snapshots: TrendSnapshotValue[],
  name: string,
  kind: "genre" | "element"
): TrendEntryValue[] {
  const works: TrendEntryValue[] = [];
  for (const snap of snapshots) {
    for (const e of snap.entries) {
      const match =
        (kind === "genre" && e.genres.includes(name)) ||
        (kind === "element" && e.elements.includes(name));
      if (match) works.push(e);
    }
  }
  const seen = new Set<string>();
  const unique = works.filter((w) => {
    const key = `${w.title}|${w.platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => b.popularity - a.popularity);
}

function buildInspirationText(
  selected: SelectedElement,
  snapshots: TrendSnapshotValue[]
): string {
  const series = buildElementSeries(snapshots, selected.name, selected.kind);
  const lifecycle = computeLifecycle(series);
  const direction = computeDirection(series);
  const topWorks = getRepresentativeWorks(snapshots, selected.name, selected.kind);
  const totalHeat = series.reduce((s, p) => s + p.heat, 0);
  const dirLabel =
    direction === "rising" ? "上升中" : direction === "falling" ? "下降中" : "平稳";

  const reps = topWorks
    .slice(0, 3)
    .map((w) => `《${w.title}》(${PLATFORM_LABEL[w.platform]})`)
    .join("、");

  return [
    `趋势元素「${selected.name}」(${
      selected.kind === "genre" ? "题材" : "元素"
    }) — ${LIFECYCLE_LABEL[lifecycle]} / ${dirLabel}`,
    `近 ${series.length} 天总热度 ${Math.round(totalHeat)}，代表作：${reps || "暂无"}`,
    `入场建议：${LIFECYCLE_ADVICE[lifecycle]}`,
  ].join("\n");
}

function buildStructureSummary(
  name: string,
  kind: string,
  lifecycle: LifecycleStageValue
): string {
  const kindLabel = kind === "genre" ? "题材" : "元素";
  const summaries: Record<LifecycleStageValue, string> = {
    emerging: `${name}${kindLabel}处于萌芽期，结构模式尚未固化。常见尝试：高事件密度（6+/千字）+ 悬念型钩子，反转节点偏前（30%-40% 位置）。`,
    exploding: `${name}${kindLabel}处于爆发期，已形成稳定爆款公式。典型结构：双反转（35%/70% 位置）+ 持续高位情绪曲线 + 人际冲突为主（>60%）。`,
    plateau: `${name}${kindLabel}处于平台期，结构高度成熟。常见配置：三幕占比 25/50/25 + 单反转（50%-60% 位置）+ 平稳情绪曲线 + 多层冲突。`,
    declining: `${name}${kindLabel}处于衰退期，需差异化破局。建议：保留核心元素 + 创新视角（如第二人称/混合时态）+ 强化内心冲突占比。`,
  };
  return summaries[lifecycle];
}
