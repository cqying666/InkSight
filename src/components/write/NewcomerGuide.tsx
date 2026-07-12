"use client";

import { useState, useEffect } from "react";
import { trackEvent } from "@/lib/report/analytics";

type ViewKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

interface NewcomerGuideProps {
  // 跳转到指定视图
  onNavigate: (view: ViewKey) => void;
}

// 首次引导标记的 localStorage key
const STORAGE_KEY = "inksight:write:newcomer-guide-seen";

// 引导步骤配置
interface GuideStep {
  num: string; // mono 编号 01/02/03
  title: string;
  hint: string;
  // 可跳转的视图，缺省表示仅提示不可跳转
  view?: ViewKey;
}

const STEPS: GuideStep[] = [
  {
    num: "01",
    title: "查看对标文",
    hint: "看看拆文提取的原文，找找节奏感",
    view: "benchmark",
  },
  {
    num: "02",
    title: "浏览素材",
    hint: "素材库在右侧抽屉，随时可展开",
  },
  {
    num: "03",
    title: "开始写作",
    hint: "中间这块白纸是你的，光标已经在闪了",
    view: "draft",
  },
];

/**
 * 新手引导浮层
 *
 * 仅在 newcomer 用户首次进入创作工作台时显示，引导 3 步走：
 * 对标文 → 素材 → 开写。
 *
 * 视觉：奶油炭灰色系，文学杂志风格（衬线标题 + mono 编号）。
 * 定位：absolute 覆盖在编辑器区域中上方，不遮挡整个页面（需父级为 relative）。
 * 持久化：关闭后写入 localStorage，不再出现。
 */
export function NewcomerGuide({ onNavigate }: NewcomerGuideProps) {
  const [visible, setVisible] = useState(false);

  // 首次进入时检查 localStorage（客户端渲染，避免 SSR 不一致）
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // 隐私模式读取失败，静默不显示
    }
  }, []);

  // 关闭引导并持久化
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 写入失败忽略
    }
    trackEvent("newcomer_guide_dismissed", {});
  };

  // 点击步骤跳转到对应视图
  const handleStepClick = (step: GuideStep) => {
    if (!step.view) return;
    onNavigate(step.view);
  };

  if (!visible) return null;

  return (
    // absolute 定位：覆盖在编辑器区域中上方，不遮挡整个页面
    <div className="absolute left-1/2 top-20 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-text/[0.06] bg-surface/95 px-6 py-5 shadow-card backdrop-blur-sm">
      {/* 标题 + 关闭按钮 */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="font-serif text-base font-semibold text-text">
          开始你的第一篇
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="关闭引导"
          className="-mr-1 -mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-soft hover:text-text"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      </div>

      {/* 步骤列表 */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const clickable = !!step.view;
          // 可点击步骤带 group 以触发编号变色；纯提示步骤不带 hover
          const containerCls = clickable
            ? "group block w-full cursor-pointer border-l-2 border-accent-warm/20 pl-3 text-left transition-colors hover:border-accent-warm"
            : "block w-full border-l-2 border-accent-warm/20 pl-3 text-left";
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-text-muted transition-colors group-hover:text-accent-warm">
                    {step.num}
                  </span>
                  <span className="font-serif text-sm font-medium text-text">
                    {step.title}
                  </span>
                </div>
                {clickable && (
                  <span className="font-mono text-xs text-text-muted transition-colors group-hover:text-accent-warm">
                    →
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {step.hint}
              </p>
            </>
          );
          if (clickable) {
            return (
              <button
                key={step.num}
                type="button"
                onClick={() => handleStepClick(step)}
                className={containerCls}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={step.num} className={containerCls}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* 底部跳过引导 */}
      <div className="mt-4 border-t border-text/[0.06] pt-3">
        <button
          type="button"
          onClick={dismiss}
          className="font-sans text-xs text-text-muted transition-colors hover:text-text"
        >
          跳过引导
        </button>
      </div>
    </div>
  );
}
