"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  HomeIcon,
  ReportIcon,
  TrendIcon,
  MaterialIcon,
  WorksIcon,
  AIControlIcon,
  CollapseIcon,
  ExpandIcon,
} from "./icons";

type Role = "admin" | "experience";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** 仅管理员可见 */
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  /** 整组仅管理员可见 */
  adminOnly?: boolean;
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "开始",
    items: [{ href: "/", label: "首页", Icon: HomeIcon }],
  },
  {
    label: "学习",
    items: [
      { href: "/trend", label: "趋势雷达", Icon: TrendIcon },
      { href: "/material", label: "素材库", Icon: MaterialIcon },
    ],
  },
  {
    label: "分析",
    items: [
      { href: "/report", label: "X 光报告", Icon: ReportIcon },
    ],
  },
  {
    label: "创作",
    items: [
      { href: "/works", label: "我的作品", Icon: WorksIcon },
    ],
  },
  {
    label: "系统",
    adminOnly: true,
    items: [
      { href: "/ai-control", label: "AI 管理", Icon: AIControlIcon },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

type CurrentUser = {
  username: string;
  role: Role;
  displayName?: string | null;
};

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  user: CurrentUser | null;
};

export function WorkspaceSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  user,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const width = collapsed ? "w-16" : "w-60";

  const isAdmin = user?.role === "admin";
  // 非管理员过滤掉 adminOnly 分组与条目
  const visibleGroups = NAV_GROUPS.filter((g) => isAdmin || !g.adminOnly).map(
    (g) => ({
      ...g,
      items: g.items.filter((it) => isAdmin || !it.adminOnly),
    })
  );

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 忽略网络错误，仍跳转登录页
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="主导航"
      className={`flex h-full flex-col bg-surface shadow-nav transition-[width] duration-200 ease-out ${width}`}
    >
      {/* 品牌区 */}
      <div className="flex items-center gap-2.5 border-b border-text/[0.04] px-5 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5"
          aria-label="InkSight 首页"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
            <span className="font-display text-sm font-extrabold text-text-inverse">
              In
            </span>
          </div>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold leading-tight tracking-tight text-text">
                InkSight
              </span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-text-muted">
                创作教练
              </span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="收起导航"
            className="ml-auto rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1"
          >
            <CollapseIcon />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="展开导航"
          className="mx-auto mt-3 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1"
        >
          <ExpandIcon />
        </button>
      )}

      {/* 导航分组 */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted/60">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 用户区 + 登出 */}
      {user && (
        <div className="border-t border-text/[0.04] px-3 py-3">
          <div
            className={`flex items-center gap-2.5 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent"
              aria-hidden="true"
            >
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-text">
                  {user.displayName || user.username}
                </div>
                <div className="truncate text-[10px] text-text-muted">
                  {user.role === "admin" ? "管理员" : "体验账户"}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="登出"
              title="登出"
              className={`shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1 disabled:opacity-50 ${
                collapsed ? "mt-2" : ""
              }`}
            >
              <svg
                className="h-[18px] w-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1 ${
          collapsed ? "justify-center" : ""
        } ${
          active
            ? "bg-accent/[0.06] font-medium text-text"
            : "text-text/60 hover:bg-bg/60 hover:text-text"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
            aria-hidden="true"
          />
        )}
        <item.Icon
          className={`h-[18px] w-[18px] shrink-0 transition-colors ${
            active ? "text-text" : "text-text-muted group-hover:text-text/80"
          }`}
        />
        {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      </Link>
    </li>
  );
}
