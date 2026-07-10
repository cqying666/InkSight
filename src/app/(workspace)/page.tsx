"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { computeHomeData, getCoachGreeting } from "@/lib/report/home-data";
import { computeUserProfile } from "@/lib/report/metrics";
import { peekEvents } from "@/lib/report/analytics";
import { SceneCard } from "@/components/home/SceneCard";
import { CoachInput } from "@/components/home/CoachInput";

/**
 * 工作台首页 · 正式版
 *
 * 结构：顶部居中 InkSight 品牌 Hero + 大输入框 + 创作场景卡片网格
 * 设计系统：奶油炭灰（Cream Charcoal）+ 文学杂志质感
 */

const SCENE_CARDS = [
  { href: "/upload", title: "拆文练习", desc: "上传一篇作品，拆解它的节奏与结构", icon: "✂️" },
  { href: "/report", title: "初稿诊断", desc: "让 Coach 给你的开头、钩子、节奏打分", icon: "🔍" },
  { href: "/compare", title: "对比改稿", desc: "把你的作品与参考作品放在一起对照", icon: "⚖️" },
  { href: "/trend", title: "灵感雷达", desc: "看看最近哪些题材和元素正在升温", icon: "📈" },
  { href: "/material", title: "素材整理", desc: "收藏、标注、调用你的创作素材", icon: "📚" },
  { href: "/write", title: "进入创作", desc: "打开工作台，边写边查", icon: "✍️" },
];

function BrandLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const boxSize = size === "lg" ? "h-16 w-16 rounded-2xl" : size === "md" ? "h-12 w-12 rounded-xl" : "h-8 w-8 rounded-md";
  const textSize = size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-sm";
  const labelSize = size === "lg" ? "text-lg" : size === "md" ? "text-base" : "text-sm";
  const subSize = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <div className="flex items-center gap-3">
      <div className={`flex ${boxSize} shrink-0 items-center justify-center bg-primary shadow-card`}>
        <span className={`font-display ${textSize} font-extrabold text-text-inverse`}>In</span>
      </div>
      <div className="hidden sm:block">
        <span className={`block font-display ${labelSize} font-bold leading-tight tracking-tight text-text`}>InkSight</span>
        <span className={`block ${subSize} uppercase tracking-[0.18em] text-text-muted`}>创作教练</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [greeting, setGreeting] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const events = peekEvents();
    const data = computeHomeData(events, 14);
    const profile = computeUserProfile(events);
    const g = getCoachGreeting(profile, data.lastActivityAt);
    setGreeting({ title: g.title, message: g.message });
  }, []);

  const handleSubmit = (text: string, files?: { name: string; text: string }[]) => {
    // 有上传文件时，走拆文流程
    if (files && files.length > 0) {
      try {
        const combined = files.map((f) => f.text).join("\n\n---\n\n");
        sessionStorage.setItem(
          "inksight:pending",
          JSON.stringify({
            text: text.trim() ? `${text}\n\n${combined}` : combined,
            paragraphs: combined.split(/\n\s*\n/).filter(Boolean),
          })
        );
      } catch {
        // sessionStorage 不可用时静默降级
      }
      router.push("/analyzing");
      return;
    }
    if (text.includes("拆") || text.includes("分析")) router.push("/upload");
    else if (text.includes("写") || text.includes("创作")) router.push("/write");
    else if (text.includes("趋势") || text.includes("题材")) router.push("/trend");
    else router.push("/write");
  };

  if (!mounted || !greeting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-serif text-sm text-text-muted">正在准备…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        {/* Hero */}
        <section className="mb-10 text-center">
          <div className="mb-6 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <h1
            className="font-serif text-title-xl font-medium text-text"
            style={{ textWrap: "balance" }}
          >
            {greeting.title}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-text-muted">{greeting.message}</p>
        </section>

        {/* 输入区 */}
        <section className="mb-12 rounded-3xl border border-text/[0.05] bg-surface p-6 shadow-card md:p-8">
          <CoachInput
            placeholder="粘贴一段小说、描述你的灵感，或说‘我想写悬疑短篇’…"
            onSubmit={handleSubmit}
            quickTags={[
              { label: "帮我拆文", onClick: () => router.push("/upload") },
              { label: "诊断现在的稿子", onClick: () => router.push("/report") },
              { label: "最近什么题材火", onClick: () => router.push("/trend") },
              { label: "给我 3 个开头灵感", onClick: () => router.push("/write") },
            ]}
          />
        </section>

        {/* 场景卡片 */}
        <section>
          <h2 className="mb-4 font-serif text-lg font-medium text-text">创作场景</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {SCENE_CARDS.map((card) => (
              <SceneCard key={card.href} {...card} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
