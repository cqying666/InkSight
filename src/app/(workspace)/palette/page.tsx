"use client";

/**
 * 配色方案预览页
 * 五版奶油纸张 + 暖调光晕的现代 SaaS 编辑感配色。
 * 路径：/palette
 */

const PALETTES = [
  {
    id: "cream-ash",
    name: "奶油炭灰",
    tagline: "原图气质 · 暖白纸张 + 深炭文字",
    colors: {
      primary: "#1C1C1E", // 深炭灰
      accent: "#7C6F66", // 暖灰褐
      bg: "#FAF7F2", // 奶油白
      bgAlt: "#F3EEE6", // 次级背景
      glow: "#F5DCC8", // 暖橙光晕
      glow2: "#E8D5E0", // 淡紫光晕
      text: "#1C1C1E",
      textMuted: "#6E6A63",
      border: "rgba(28,28,30,0.08)",
    },
    desc: "最接近原图气质：大面积奶油白、顶部淡粉紫→暖橙光晕、深炭灰文字。",
  },
  {
    id: "oat-latte",
    name: "燕麦拿铁",
    tagline: "暖调 · 燕麦色纸张 + 咖啡文字",
    colors: {
      primary: "#3D3229",
      accent: "#A27F5D",
      bg: "#F7F1E8",
      bgAlt: "#EDE5D8",
      glow: "#F0D5B8",
      glow2: "#E5CFC5",
      text: "#3D3229",
      textMuted: "#7D7167",
      border: "rgba(61,50,41,0.08)",
    },
    desc: "比奶油炭灰更暖一度，像燕麦拿铁的奶泡与咖啡油脂。",
  },
  {
    id: "pearl-ink",
    name: "珍珠墨",
    tagline: "冷调 · 珍珠灰白 + 墨青文字",
    colors: {
      primary: "#2A3136",
      accent: "#6A7D89",
      bg: "#F6F6F4",
      bgAlt: "#EAEAE6",
      glow: "#D8E2E8",
      glow2: "#E4DDE8",
      text: "#2A3136",
      textMuted: "#6F777C",
      border: "rgba(42,49,54,0.08)",
    },
    desc: "更冷的变体：珍珠灰白背景、淡蓝紫微光、墨青文字，偏冷静理性。",
  },
  {
    id: "blush-stone",
    name: "腮红石",
    tagline: "柔粉 · 米白纸张 + 玫瑰灰文字",
    colors: {
      primary: "#3D2F33",
      accent: "#B87B80",
      bg: "#FDF8F6",
      bgAlt: "#F5EBE7",
      glow: "#F7D6D0",
      glow2: "#EAD6E0",
      text: "#3D2F33",
      textMuted: "#7F6F72",
      border: "rgba(61,47,51,0.08)",
    },
    desc: "加入极淡的腮粉光晕，柔化整体，适合女性友好的编辑感。",
  },
  {
    id: "sage-paper",
    name: "鼠尾草纸",
    tagline: "自然 · 灰绿纸张 + 深苔文字",
    colors: {
      primary: "#2B302D",
      accent: "#7A8C7B",
      bg: "#F4F5F0",
      bgAlt: "#E8EBE4",
      glow: "#D9E2D6",
      glow2: "#E2DED0",
      text: "#2B302D",
      textMuted: "#6F756F",
      border: "rgba(43,48,45,0.08)",
    },
    desc: "自然系变体：鼠尾草灰绿调纸张、淡苔绿光晕、深苔文字。",
  },
];

export default function PalettePreviewPage() {
  return (
    <main className="min-h-screen bg-[#FAF7F2] px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        {/* 页头 */}
        <header className="mb-10 border-b border-black/8 pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/45">
            Palette Preview · 配色预览
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-[#1C1C1E] md:text-4xl">
            选一版喜欢的配色
          </h1>
          <p className="mt-2 text-sm text-black/55">
            基于你截图的气质重新设计：奶油白纸张 + 顶部暖调光晕 + 深炭文字。
            每版保持克制、安静、高端的现代 SaaS 编辑感。
          </p>
        </header>

        {/* 五版配色样本 */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {PALETTES.map((palette, idx) => (
            <PaletteCard key={palette.id} palette={palette} index={idx + 1} />
          ))}
        </div>

        {/* 底部说明 */}
        <footer className="mt-10 border-t border-black/8 pt-5 text-center">
          <p className="font-mono text-[11px] text-black/40">
            告诉我你选哪一版（编号或名字），我来全局替换。
          </p>
        </footer>
      </div>
    </main>
  );
}

type Palette = (typeof PALETTES)[number];

function PaletteCard({
  palette,
  index,
}: {
  palette: Palette;
  index: number;
}) {
  const c = palette.colors;

  return (
    <section
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ borderColor: c.border, backgroundColor: c.bg }}
    >
      {/* 顶部光晕 */}
      <div
        className="relative h-20 overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${c.glow}, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 0%, ${c.glow2}, transparent 55%)`,
        }}
      >
        {/* 卡片头：编号 + 配色名 */}
        <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: c.textMuted }}
          >
            No. {String(index).padStart(2, "0")}
          </p>
          <h2
            className="mt-0.5 font-serif text-2xl font-bold"
            style={{ color: c.text }}
          >
            {palette.name}
          </h2>
          <p className="text-xs" style={{ color: c.textMuted }}>
            {palette.tagline}
          </p>
        </div>
      </div>

      {/* 色板条 */}
      <div className="flex" style={{ height: "32px" }}>
        {[
          { color: c.primary, label: "主色" },
          { color: c.accent, label: "强调" },
          { color: c.bgAlt, label: "次背景" },
          { color: c.text, label: "文字" },
          { color: c.textMuted, label: "弱文字" },
        ].map((sw) => (
          <div
            key={sw.label}
            className="flex flex-1 items-center justify-center font-mono text-[9px]"
            style={{
              backgroundColor: sw.color,
              color: sw.label === "次背景" || sw.label === "弱文字" ? c.text : "#fff",
            }}
            title={`${sw.label} ${sw.color}`}
          >
            {sw.label}
          </div>
        ))}
      </div>

      {/* 真实组件样式展示 */}
      <div className="px-6 py-6">
        {/* 教练对话区缩影 */}
        <div
          className="mb-4 rounded-lg p-4"
          style={{
            backgroundColor: c.bgAlt,
            border: `1px solid ${c.border}`,
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full font-serif text-[11px] font-semibold"
              style={{
                backgroundColor: `${c.primary}12`,
                color: c.primary,
              }}
            >
              教
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color: c.accent }}
            >
              Coach
            </span>
          </div>
          <p
            className="font-serif text-sm leading-relaxed"
            style={{ color: c.text }}
          >
            {palette.desc}
          </p>
        </div>

        {/* 按钮 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full px-4 py-2 font-sans text-xs text-white"
            style={{ backgroundColor: c.primary }}
          >
            主按钮
          </button>
          <button
            type="button"
            className="rounded-full px-4 py-2 font-sans text-xs"
            style={{
              border: `1px solid ${c.border}`,
              color: c.text,
              backgroundColor: "transparent",
            }}
          >
            次按钮
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs"
            style={{
              border: `1px solid ${c.border}`,
              color: c.textMuted,
              backgroundColor: c.bg,
            }}
          >
            标签
          </button>
        </div>

        {/* 输入框 */}
        <div
          className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: c.border, backgroundColor: c.bg }}
        >
          <span style={{ color: c.textMuted }}>→</span>
          <span className="text-sm" style={{ color: c.textMuted }}>
            跟教练说点什么…
          </span>
        </div>

        {/* 数据条 */}
        <div className="mb-3">
          <div
            className="mb-1.5 flex h-4 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: `${c.text}08` }}
          >
            <div style={{ width: "45%", backgroundColor: c.primary }} />
            <div style={{ width: "30%", backgroundColor: c.accent }} />
            <div style={{ width: "25%", backgroundColor: `${c.textMuted}80` }} />
          </div>
          <div className="flex gap-3 font-mono text-[10px]" style={{ color: c.textMuted }}>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.primary }} />
              拆文 45%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
              创作 30%
            </span>
          </div>
        </div>

        {/* 数字指标 */}
        <div className="grid grid-cols-3 gap-3 border-t pt-3" style={{ borderColor: c.border }}>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: c.textMuted }}>
              活跃
            </p>
            <p className="mt-0.5">
              <span className="font-serif text-xl font-bold tabular-nums" style={{ color: c.text }}>
                8
              </span>
              <span className="text-[10px]" style={{ color: c.textMuted }}> /14</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: c.textMuted }}>
              操作
            </p>
            <p className="mt-0.5">
              <span className="font-serif text-xl font-bold tabular-nums" style={{ color: c.text }}>
                126
              </span>
              <span className="text-[10px]" style={{ color: c.textMuted }}> 次</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: c.textMuted }}>
              闭环
            </p>
            <p className="mt-0.5">
              <span className="font-serif text-xl font-bold tabular-nums" style={{ color: c.accent }}>
                3
              </span>
              <span className="text-[10px]" style={{ color: c.textMuted }}> 次</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
