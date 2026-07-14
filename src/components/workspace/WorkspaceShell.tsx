"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

const NAV_KEY = "inksight:nav-collapsed";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // 恢复折叠偏好（仅客户端）
  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(NAV_KEY) === "1") setCollapsed(true);
    } catch {
      // 忽略隐私模式读取失败
    }
  }, []);

  // 持久化折叠偏好
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(NAV_KEY, collapsed ? "1" : "0");
    } catch {
      // 忽略写入失败
    }
  }, [collapsed, mounted]);

  // 路由切换时关闭移动端覆盖层
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // 移动端覆盖层打开时锁定背景滚动
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  const toggleCollapse = () => setCollapsed((c) => !c);

  return (
    <div className="workspace-shell relative flex min-h-screen bg-bg text-text">
      {/* 全局颗粒纹理（design.md §6.1）*/}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
        aria-hidden="true"
      >
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </div>

      {/* 顶部暖调光晕——窗边漫射光感（低透明度、大尺度、边缘柔化）*/}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% -10%, rgba(245,220,200,0.32), transparent 65%), radial-gradient(ellipse 90% 70% at 85% -5%, rgba(232,213,224,0.28), transparent 60%), radial-gradient(ellipse 70% 60% at 15% 0%, rgba(245,220,200,0.18), transparent 55%)",
        }}
        aria-hidden="true"
      />

      {/* 全局暗角 vignette——引导视觉焦点到页面中心 */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 40%, transparent 50%, rgba(28,28,30,0.035) 100%)",
        }}
        aria-hidden="true"
      />

      {/* 细密垂直线条纹理 pinstripe——卡纸质感 */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        aria-hidden="true"
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="pinstripe" patternUnits="userSpaceOnUse" width="3" height="100%" patternTransform="rotate(0)">
              <line x1="0" y1="0" x2="0" y2="100%" stroke="rgba(28,28,30,1)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#pinstripe)" />
        </svg>
      </div>

      {/* 跳到主内容（可达性） */}
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:font-serif focus:text-text-inverse"
      >
        跳到主内容
      </a>

      {/* 桌面端持久侧栏（lg+） */}
      <div className="relative z-10 hidden lg:flex">
        <div className="sticky top-0 h-screen shrink-0">
          <WorkspaceSidebar
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />
        </div>
      </div>

      {/* 移动端覆盖侧栏（<lg） */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          mobileNavOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div
          className={`absolute inset-0 bg-text/30 transition-opacity duration-200 ${
            mobileNavOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileNavOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-64 max-w-[80vw] transition-transform duration-200 ease-out ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            boxShadow: mobileNavOpen
              ? "4px 0 24px rgba(28,28,30,0.08)"
              : "none",
          }}
        >
          <WorkspaceSidebar
            collapsed={false}
            onToggleCollapse={() => setMobileNavOpen(false)}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>
      </div>

      {/* 主区 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏（<lg） */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-text/[0.06] bg-bg-alt/95 px-4 py-3 lg:hidden backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开导航"
            aria-expanded={mobileNavOpen}
            className="rounded-md p-1.5 text-text transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary">
              <span className="font-display text-[10px] font-extrabold text-text-inverse">In</span>
            </div>
            <span className="font-display text-base font-bold text-text tracking-tight">
              InkSight
            </span>
          </div>
        </header>

        <div id="workspace-content" className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
