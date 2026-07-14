"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { computeHomeData, getCoachGreeting } from "@/lib/report/home-data";
import { computeUserProfile } from "@/lib/report/metrics";
import { peekEvents } from "@/lib/report/analytics";
import { SceneCard } from "@/components/home/SceneCard";
import { CoachInput } from "@/components/home/CoachInput";
import { LoopDashboardSection } from "@/components/home/LoopDashboardSection";
import { createExample, stripFileExtension, upsertExample } from "@/lib/example";

/**
 * 工作台首页 · 正式版
 *
 * 结构：顶部居中 InkSight 品牌 Hero + 大输入框 + 创作场景卡片网格
 * 设计系统：奶油炭灰（Cream Charcoal）+ 文学杂志质感
 */

const SCENE_CARDS = [
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
  const [generating, setGenerating] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    (async () => {
      const events = await peekEvents();
      if (cancelled) return;
      const data = computeHomeData(events, 14);
      const profile = computeUserProfile(events);
      const g = getCoachGreeting(profile, data.lastActivityAt);
      if (cancelled) return;
      setGreeting({ title: g.title, message: g.message });
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (
    text: string,
    files?: { name: string; text: string }[],
    model?: string,
    skills?: { id: string; label: string }[]
  ) => {
    // 有上传文件时，走拆文流程
  if (files && files.length > 0) {
    try {
      // 原文仅取上传文件内容（用户的提示词属于指令，不应混入小说正文）
      const combined = files.map((f) => f.text).join("\n\n---\n\n");
      const title =
        files.length === 1
          ? stripFileExtension(files[0].name)
          : `${stripFileExtension(files[0].name)}等${files.length}篇`;
      const example = createExample({ title, text: combined });
      const saved = await upsertExample(example);
      sessionStorage.setItem(
        "inksight:pending",
        JSON.stringify({
          text: combined,
          paragraphs: combined.split(/\n\s*\n/).filter(Boolean),
          fileName: title,
          ...(saved ? { exampleId: example.id } : {}),
        })
      );
    } catch {
      // sessionStorage 不可用时静默降级
    }
    router.push("/analyzing");
    return;
  }

    // 技能路由：优先根据 @ 引用的技能分流
    const hasSkill = (id: string) => !!skills?.some((s) => s.id === id);
    if (hasSkill("teardown")) {
      // 拆文技能：有文本就走分析，没文本去上传页
      if (text.trim().length >= 100) {
        try {
          sessionStorage.setItem(
            "inksight:pending",
            JSON.stringify({
              text: text.trim(),
              paragraphs: text.trim().split(/\n\s*\n/).filter(Boolean),
              fileName: "粘贴文本",
            })
          );
          router.push("/analyzing");
          return;
        } catch {
          // ignore
        }
      }
      router.push("/upload");
      return;
    }
    if (hasSkill("guide")) {
      // 写导语技能：调用导语生成 API，返回 3 候选后跳工作台展示
      const theme = text.trim() || "未指定题材";
      setGenerating("guide");
      setGenError(null);
      try {
        const res = await fetch("/api/guide-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme, wordCount: 10000 }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.detail || "导语生成失败");
        }
        sessionStorage.setItem(
          "inksight:generation-pending",
          JSON.stringify({ type: "guide", data: json.data, createdAt: Date.now() }),
        );
        router.push("/write?generating=guide");
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "导语生成失败");
      } finally {
        setGenerating(null);
      }
      return;
    }
    if (hasSkill("outline")) {
      // 大纲生成技能：调用大纲生成 API 后跳工作台展示
      const theme = text.trim() || "未指定题材";
      setGenerating("outline");
      setGenError(null);
      try {
        const res = await fetch("/api/outline-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme,
            coreGerm: theme,
            wordCount: 10000,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.detail || "大纲生成失败");
        }
        sessionStorage.setItem(
          "inksight:generation-pending",
          JSON.stringify({ type: "outline", data: json.data, createdAt: Date.now() }),
        );
        router.push("/write?generating=outline");
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "大纲生成失败");
      } finally {
        setGenerating(null);
      }
      return;
    }
    if (hasSkill("detail-outline")) {
      // 细纲生成技能：需要已有大纲，跳工作台选择作品后生成
      router.push("/write?generating=detail-outline");
      return;
    }

    // 短文本（≤ 500 字）+ 拆解意图关键词 → 走导语专项拆解
    const GUIDE_MAX_LEN = 500;
    const trimmed = text.trim();
    const guideKeywords =
      trimmed.includes("导语") ||
      trimmed.includes("开头") ||
      trimmed.includes("钩子") ||
      trimmed.includes("拆导");
    if (guideKeywords && trimmed.length <= GUIDE_MAX_LEN && trimmed.length >= 30) {
      try {
        sessionStorage.setItem(
          "inksight:guide-pending",
          JSON.stringify({ text: trimmed })
        );
      } catch {
        // ignore
      }
      router.push("/analyzing/guide");
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
            placeholder="可通过@引用技能"
            onSubmit={handleSubmit}
          />
        </section>

        <LoopDashboardSection />

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

      {/* 生成中遮罩 */}
      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-text/[0.06] bg-surface px-8 py-6 shadow-card">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="font-serif text-sm text-text">
              {generating === "guide" ? "正在生成导语候选…" : "正在生成大纲…"}
            </p>
            <p className="text-xs text-text-muted">通常需要 20-60 秒</p>
          </div>
        </div>
      )}

      {/* 生成错误提示 */}
      {genError && !generating && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border-l-4 border-danger/40 bg-surface px-4 py-3 shadow-card">
          <p className="text-xs text-danger/90">{genError}</p>
          <button
            type="button"
            onClick={() => setGenError(null)}
            className="mt-1 text-[10px] text-text-muted hover:text-text"
          >
            知道了
          </button>
        </div>
      )}
    </main>
  );
}
