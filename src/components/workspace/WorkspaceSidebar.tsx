"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ReportIcon,
  CompareIcon,
  TrendIcon,
  MaterialIcon,
  WriteIcon,
  DashboardIcon,
  CollapseIcon,
  ExpandIcon,
  DrawerIcon,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
};

type NavGroup = {
  label: string;
  items: NavItem[];
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
      { href: "/compare", label: "双篇对比", Icon: CompareIcon },
    ],
  },
  {
    label: "创作",
    items: [{ href: "/write", label: "创作工作台", Icon: WriteIcon }],
  },
  {
    label: "复盘",
    items: [{ href: "/dashboard", label: "闭环仪表盘", Icon: DashboardIcon }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenDrawer: () => void;
  onNavigate?: () => void;
};

export function WorkspaceSidebar({
  collapsed,
  onToggleCollapse,
  onOpenDrawer,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const width = collapsed ? "w-16" : "w-60";

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
        {NAV_GROUPS.map((group) => (
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

      {/* 底部：伴随面板入口 */}
      <div className="border-t border-text/[0.04] px-3 py-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="打开伴随面板（素材 / 趋势）"
          title={collapsed ? "伴随面板（素材 / 趋势）" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text/70 transition-all hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <DrawerIcon className="h-[18px] w-[18px] shrink-0 text-text-muted" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate">伴随面板</span>
              <span className="block text-[10px] text-text-muted/70">素材 · 趋势</span>
            </span>
          )}
        </button>
      </div>
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
