"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { computeHomeData, getCoachGreeting } from "@/lib/report/home-data";
import { computeUserProfile } from "@/lib/report/metrics";
import { peekEvents } from "@/lib/report/analytics";
import { SceneCard } from "@/components/home/SceneCard";
import { CoachInput } from "@/components/home/CoachInput";
import { LoopDashboardSection } from "@/components/home/LoopDashboardSection";

/**
 * 工作台首页 · 正式版
 *
 * 结构：顶部居中 InkSight 品牌 Hero + 大输入框 + 创作场景卡片网格
 * 设计系统：奶油炭灰（Cream Charcoal）+ 文学杂志质感
 */

const SCENE_CARDS = [
  { href: "/report", title: "初稿诊断", desc: "让 Coach 给你的开头、钩子、节奏打分", icon: "🔍" },
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
    const trimmed = text.trim();
    const sourceFiles = files?.filter((file) => file.text.trim()) ?? [];
    const runGuideGeneration = async (theme: string) => {
      setGenerating("guide");
      setGenError(null);
      try {
        const res = await fetch("/api/guide-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: theme || "未指定题材", wordCount: 10000 }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.detail || "导语生成失败");
        }
        sessionStorage.setItem(
          "inksight:generation-pending",
          JSON.stringify({ type: "guide", data: json.data, createdAt: Date.now() })
        );
        router.push("/write?generating=guide");
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "导语生成失败");
      } finally {
        setGenerating(null);
      }
    };

    // 显式 @技能拥有最高优先级，保持已有技能语义。
    const hasSkill = (id: string) => !!skills?.some((s) => s.id === id);
    if (hasSkill("guide")) {
      await runGuideGeneration(trimmed);
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

    setGenerating("creation");
    setGenError(null);
    try {
      const response = await fetch("/api/creation-sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, files: sourceFiles, modelId: model || undefined,
          task: hasSkill("material") ? "素材转核心梗与框架" : hasSkill("creation") ? "拆解并探索二创方向" : hasSkill("teardown") ? "拆解对标文" : undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "创建会话失败");
      router.push(`/creation?id=${encodeURIComponent(result.id)}&start=1`);
      return true;
    } catch (error) {
      setGenError(error instanceof Error ? error.message : "创建会话失败，输入已保留");
      return false;
    } finally { setGenerating(null); }

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text-muted">从对标故事或生活素材，找到值得写的方向</p><button type="button" onClick={() => router.push("/creation")} className="text-xs text-accent hover:underline">历史创作会话 →</button></div>
          <CoachInput
            placeholder="粘贴经历、对话、脑洞或上传对标文，告诉我想提炼核心梗、比较框架，还是拆解故事…"
            disabled={!!generating}
            onSubmit={handleSubmit}
          />
          <p className="mt-3 text-xs leading-6 text-text-muted">素材转核心梗与框架：可直接说“帮我从这组素材提炼三个核心梗，推荐适合的框架”。原始素材、创作要求和你已确定的虚构设定可分段说明。</p>
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
              {generating === "creation" ? "正在建立创作会话…" : generating === "guide" ? "正在生成导语候选…" : "正在生成大纲…"}
            </p>
            {generating !== "creation" && <p className="text-xs text-text-muted">通常需要 20-60 秒</p>}
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
