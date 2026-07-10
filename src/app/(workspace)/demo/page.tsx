"use client";

import Link from "next/link";
import { useState } from "react";

// Demo page: 展示 InkSight 新设计语言 v3 效果
// 独立页面，不依赖全局 tailwind token 改动

type NavItem = { href: string; label: string; active?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "开始",
    items: [{ href: "#", label: "首页", active: true }],
  },
  {
    label: "学习",
    items: [
      { href: "#", label: "趋势雷达" },
      { href: "#", label: "素材库" },
    ],
  },
  {
    label: "分析",
    items: [
      { href: "#", label: "拆文上传" },
      { href: "#", label: "X 光报告" },
      { href: "#", label: "双篇对比" },
    ],
  },
  {
    label: "创作",
    items: [{ href: "#", label: "创作工作台" }],
  },
  {
    label: "复盘",
    items: [{ href: "#", label: "闭环仪表盘" }],
  },
];

const heatmapData = [
  { genre: "复仇", values: [6, 7, 5, 5, 9, 10, 6, 6, 6, 8] },
  { genre: "宫斗", values: [8, 8, 9, 9, 4, 12, 9, 6, 5, 7] },
  { genre: "悬疑", values: [10, 8, 8, 11, 6, 14, 7, 11, 9, 10] },
  { genre: "惊悚", values: [8, 10, 10, 7, 7, 6, 7, 3, 11, 5] },
  { genre: "日常", values: [8, 9, 10, 10, 9, 6, 8, 4, 5, 6] },
  { genre: "治愈", values: [10, 7, 4, 9, 11, 7, 5, 4, 11, 5] },
  { genre: "科幻", values: [8, 4, 9, 8, 8, 11, 6, 8, 7, 4] },
  { genre: "穿越", values: [5, 5, 9, 10, 7, 8, 5, 3, 4, 9] },
];
const elements = ["双强", "反转", "复仇", "悬念", "爽感", "甜宠", "系统", "群像", "虐心", "重生"];
const heatColors = ["#FDFCFA", "#EDE5DF", "#E2CFC7", "#D4A89A", "#B86B5A", "#9C4B3C"];
const heatLabels = ["0", "低", "中低", "中", "高", "极高"];

function heatLevel(value: number) {
  if (value >= 14) return 5;
  if (value >= 11) return 4;
  if (value >= 9) return 3;
  if (value >= 7) return 2;
  if (value >= 5) return 1;
  return 0;
}

function isLight(bg: string) {
  // 简单判断背景是否浅色，浅色用深字，深色用浅字
  const level = heatColors.indexOf(bg);
  return level <= 2;
}

export default function DemoPage() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen" style={{ background: "#FDFCFA" }}>
      {/* 新导航栏 */}
      <nav
        className="flex h-screen w-60 flex-col"
        style={{
          background: "#FFFFFF",
          borderRight: "1px solid rgba(28,28,30,0.05)",
          boxShadow: "2px 0 16px rgba(28,28,30,0.02)",
        }}
      >
        {/* 品牌区 */}
        <div className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: "1px solid rgba(28,28,30,0.04)" }}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ background: "#1C1C1E" }}
          >
            <span className="text-sm font-extrabold" style={{ color: "#FDFCFA" }}>
              In
            </span>
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight" style={{ color: "#1C1C1E" }}>
              InkSight
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#6B665E" }}>
              创作教练
            </div>
          </div>
        </div>

        {/* 导航分组 */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.active;
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150"
                        style={{
                          color: active ? "#1C1C1E" : "#6B665E",
                          background: active ? "rgba(156,75,60,0.06)" : "transparent",
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                            style={{ background: "#9C4B3C" }}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Hero */}
          <header className="mb-8" style={{ borderBottom: "1px solid rgba(28,28,30,0.06)" }}>
            <div className="text-xs uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
              2026 年 7 月 9 日 · 星期四
            </div>
            <h1
              className="mt-2 font-serif text-4xl font-medium"
              style={{ color: "#1C1C1E", lineHeight: 1.15, letterSpacing: "-0.02em" }}
            >
              今天写点什么？
            </h1>
            <p className="mt-2 text-sm" style={{ color: "#6B665E" }}>
              从拆文开始，也可以直接进入创作——随你。
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            {/* 左侧：Coach 卡片 + 上传区 */}
            <div className="space-y-6">
              {/* Coach 卡片 */}
              <section
                className="rounded-2xl p-6"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                    style={{ background: "rgba(156,75,60,0.08)", color: "#9C4B3C" }}
                  >
                    教
                  </div>
                  <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
                    Coach
                  </span>
                </div>
                <p className="font-serif text-lg" style={{ color: "#1C1C1E", lineHeight: 1.7 }}>
                  可以从拆文开始，也可以直接进入创作——随你。
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["拆文", "创作", "看趋势", "找素材"].map((tag) => (
                    <button
                      key={tag}
                      className="rounded-full border px-4 py-1.5 text-sm transition-all hover:shadow-sm"
                      style={{ borderColor: "#EAE8E3", color: "#6B665E", background: "#FFFFFF" }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="上传小说拆解，或开始创作…"
                    className="flex-1 rounded-lg border px-4 py-2.5 text-sm outline-none"
                    style={{ borderColor: "#EAE8E3", background: "#FDFCFA", color: "#1C1C1E" }}
                  />
                  <button
                    className="rounded-full px-5 py-2.5 text-sm font-medium"
                    style={{ background: "#1C1C1E", color: "#FDFCFA" }}
                  >
                    发送
                  </button>
                </div>
              </section>

              {/* 上传区 Demo */}
              <section
                className="rounded-2xl p-6"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <h2 className="font-serif text-xl font-medium" style={{ color: "#1C1C1E" }}>
                  上传小说，开始拆解
                </h2>
                <p className="mt-1 text-xs" style={{ color: "#6B665E" }}>
                  支持 .txt / .md / .docx / .pdf / .rtf 等所有文本类格式
                </p>
                <div
                  className="mt-4 flex h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all"
                  style={{ borderColor: "#EAE8E3", background: "#FDFCFA" }}
                >
                  <div className="text-2xl" style={{ color: "#9C4B3C" }}>⬆</div>
                  <div className="mt-2 font-serif text-base" style={{ color: "#1C1C1E" }}>
                    点击或拖拽文件到此处
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "#6B665E" }}>
                    最大 50,000 字
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button className="text-sm" style={{ color: "#6B665E" }}>
                    解析失败？直接粘贴文本
                  </button>
                  <button
                    className="rounded-full px-6 py-2 text-sm font-medium"
                    style={{ background: "#1C1C1E", color: "#FDFCFA" }}
                  >
                    开始拆解 →
                  </button>
                </div>
              </section>

              {/* 新热力图 Demo */}
              <section
                className="rounded-2xl p-6"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <h2 className="font-serif text-xl font-medium" style={{ color: "#1C1C1E" }}>
                  趋势热力图
                </h2>
                <p className="mt-1 text-xs" style={{ color: "#6B665E" }}>
                  题材 × 元素矩阵，深色格白字、浅色格黑字，可读性优先
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1"></th>
                        {elements.map((el) => (
                          <th key={el} className="p-1 text-xs font-normal" style={{ color: "#6B665E" }}>
                            {el}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.map((row) => (
                        <tr key={row.genre}>
                          <td className="p-1 text-xs" style={{ color: "#1C1C1E" }}>
                            {row.genre}
                          </td>
                          {row.values.map((v, i) => {
                            const level = heatLevel(v);
                            const bg = heatColors[level];
                            const textColor = isLight(bg) ? "#1C1C1E" : "#FFFFFF";
                            return (
                              <td key={i} className="p-0.5">
                                <div
                                  className="flex h-9 w-11 items-center justify-center rounded-md text-[10px] font-medium transition-transform hover:scale-105"
                                  style={{ background: bg, color: textColor }}
                                  onMouseEnter={() => setHovered(`${row.genre}-${elements[i]}: ${v}`)}
                                  onMouseLeave={() => setHovered(null)}
                                >
                                  {v}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hovered && (
                  <div className="mt-2 text-xs" style={{ color: "#6B665E" }}>
                    {hovered}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "#6B665E" }}>
                  <span>热度：</span>
                  {heatLabels.map((label, i) => (
                    <span key={label} className="flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border"
                        style={{ background: heatColors[i], borderColor: "#EAE8E3" }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            {/* 右侧：今日议程 + 数据 */}
            <aside className="space-y-6">
              <section
                className="rounded-2xl p-5"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
                  <span>Agenda</span>
                  <span>·</span>
                  <span>今日议程</span>
                </div>
                <ul className="space-y-3">
                  {[
                    { num: "01", title: "开始拆文", desc: "上传一篇短篇小说，拆解结构、节奏、情绪曲线" },
                    { num: "02", title: "开始创作", desc: "进入工作台，边写边查，把方法用起来" },
                    { num: "03", title: "看看风口", desc: "题材 × 元素热力矩阵，找今天的灵感" },
                  ].map((item) => (
                    <li key={item.num} className="flex gap-3">
                      <span className="font-mono text-xs" style={{ color: "#9C4B3C" }}>{item.num}</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: "#1C1C1E" }}>{item.title}</div>
                        <div className="text-xs" style={{ color: "#6B665E" }}>{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="rounded-2xl p-5"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
                  <span>Stats</span>
                  <span>·</span>
                  <span>数据边注</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "活跃天数", value: "1 / 14" },
                    { label: "总操作次数", value: "3" },
                    { label: "最常用", value: "拆文" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: "#6B665E" }}>{s.label}</span>
                      <span className="font-display text-lg font-semibold" style={{ color: "#1C1C1E" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 新标签样式 */}
              <section
                className="rounded-2xl p-5"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #EAE8E3",
                  boxShadow: "0 1px 2px rgba(28,28,30,0.03), 0 6px 24px rgba(28,28,30,0.04)",
                }}
              >
                <div className="mb-3 text-xs uppercase tracking-[0.14em]" style={{ color: "#6B665E" }}>
                  组件样式
                </div>
                <div className="flex flex-wrap gap-2">
                  {["拆文提取", "plot-driven", "情绪钩子", "4.2/5"].map((t, i) => (
                    <span
                      key={t}
                      className="rounded-md border px-2 py-1 text-xs"
                      style={{
                        borderColor: i === 1 ? "rgba(156,75,60,0.25)" : "#EAE8E3",
                        color: i === 1 ? "#9C4B3C" : "#6B665E",
                        background: i === 1 ? "rgba(156,75,60,0.06)" : "#FFFFFF",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-full px-4 py-1.5 text-xs"
                    style={{ background: "#9C4B3C", color: "#FFFFFF" }}
                  >
                    主要操作
                  </button>
                  <button
                    className="rounded-full border px-4 py-1.5 text-xs"
                    style={{ borderColor: "#EAE8E3", color: "#6B665E", background: "#FFFFFF" }}
                  >
                    次要操作
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
