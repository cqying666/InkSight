"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 登录页
 *
 * 奶油炭灰配色（Editorial Paper + Cinnabar），与工作台外壳一致。
 * 支持 ?from= 登录后回跳。
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 已登录则直接跳走
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) router.replace(from);
      })
      .catch(() => {});
  }, [from, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "登录失败");
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 text-text">
      {/* 暖调光晕背景，与工作台外壳一致 */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% -10%, rgba(245,220,200,0.32), transparent 65%), radial-gradient(ellipse 90% 70% at 85% -5%, rgba(232,213,224,0.28), transparent 60%), radial-gradient(ellipse 70% 60% at 15% 0%, rgba(245,220,200,0.18), transparent 55%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        aria-hidden="true"
      >
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* 品牌 */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-lg font-extrabold text-text-inverse">In</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">InkSight</h1>
          <p className="mt-1 text-sm text-text-muted">创作教练 · 登录</p>
        </div>

        {/* 登录卡片 */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-text/[0.06] bg-surface p-7 shadow-card"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-text-muted/70">
              用户名
            </span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-md border border-text/[0.08] bg-bg-soft px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
              placeholder="输入用户名"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-text-muted/70">
              密码
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-text/[0.08] bg-bg-soft px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-muted/50 focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
              placeholder="输入密码"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-text-muted/60">
          账户由管理员分配
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
