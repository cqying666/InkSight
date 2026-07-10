"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloseIcon, MaterialIcon, TrendIcon } from "./icons";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

const TABS = [
  {
    key: "material",
    label: "素材",
    href: "/material",
    Icon: MaterialIcon,
    title: "素材库",
    desc: "从拆文结果与热门元素中收藏可复用的结构模式，按情境检索。",
    tips: [
      "创作时按需唤出，不打断写作流",
      "支持情境语义匹配，而非关键词堆砌",
      "收藏的素材会沉淀为你独有的创作语料",
    ],
  },
  {
    key: "trend",
    label: "趋势",
    href: "/trend",
    Icon: TrendIcon,
    title: "趋势雷达",
    desc: "追踪各平台热门题材与元素走向，让创作踩对风口而非盲目下注。",
    tips: [
      "题材热度只作参考，不替代判断",
      "关注上升期元素，避开衰退期",
      "趋势要与拆文学到的结构规律结合",
    ],
  },
] as const;

export function AccompanyDrawer({ open, onClose }: DrawerProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>(
    "material"
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const tab = TABS.find((t) => t.key === activeTab)!;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={`fixed inset-0 z-40 bg-text/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 抽屉面板 */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="伴随面板"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-[88vw] max-w-sm flex-col overflow-y-auto overscroll-contain border-l border-text/[0.08] bg-bg-elevated shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-text/[0.08] px-5 py-4">
          <div>
            <p className="font-serif text-base font-semibold text-text">
              伴随面板
            </p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
              创作过程中的随时调用
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭伴随面板"
            className="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-text/[0.05] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-text/[0.08]" role="tablist" aria-label="伴随内容切换">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 ${
                  active
                    ? "border-b-2 border-primary text-primary"
                    : "border-b-2 border-transparent text-text-muted hover:text-text"
                }`}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-5" role="tabpanel">
          <h3 className="font-serif text-xl text-text">{tab.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{tab.desc}</p>

          <div className="mt-5 rounded-sm border border-text/[0.08] bg-bg-alt p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
              教练提示
            </p>
            <ul className="space-y-2">
              {tab.tips.map((tip) => (
                <li
                  key={tip}
                  className="flex gap-2 text-sm leading-relaxed text-text/80"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href={tab.href}
            onClick={onClose}
            className="mt-6 block rounded-full bg-primary px-4 py-2.5 text-center font-sans text-sm text-text-inverse transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
          >
            打开完整{tab.title} →
          </Link>
        </div>
      </aside>
    </>
  );
}
