"use client";

import { useCallback } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/report/analytics";
import { useUserProfile } from "@/lib/report/use-user-profile";

/**
 * P5-T12 + P6-T1 创作完成"下一步引导"
 *
 * PRD 5.7 + 特性表第 11 项：工作台内的动态下一步引导。
 * 与报告页 NextSteps（P2-T10）的区别：
 *  - 报告页 NextSteps：拆文后，基于诊断结果推荐
 *  - 工作台 WriteNextSteps：写作中/完成后，基于创作产出（字数/大纲）推荐
 *
 * 双维度个性化（P6-T1 增强）：
 *  1. 创作维度（原有）：字数/大纲
 *  2. 用户阶段维度（新增）：newcomer/learner/creator/looped
 *
 * 动态逻辑：
 *  - 字数 < 100：鼓励继续写 / 建大纲
 *  - 字数 100~500：可发起写后分析
 *  - 字数 > 500：推荐写后分析 + 导出 + 对比
 *  - 无大纲：推荐创建大纲
 *  - 有大纲：推荐对照大纲检查
 *
 * 阶段化推荐策略：
 *  - newcomer：鼓励完成首篇 + 拆文学习
 *  - learner：强力推荐写后分析（学以致用，闭环首圈）
 *  - creator：推荐写后分析完成闭环 + 对比
 *  - looped：推荐导出 + 对比持续精进
 */
interface Props {
  wordCount: number;
  hasOutline: boolean;
}

interface NextStepOption {
  id: string;
  label: string;
  hint: string;
  href?: string;
  onClick?: () => void;
  /** 仅展示提示，不可点击（指向页内其他控件）*/
  hintOnly?: boolean;
  /** 阶段标记（"推荐"徽章） */
  recommended?: boolean;
  priority: number;
}

const STAGE_LABEL: Record<string, string> = {
  newcomer: "新手",
  learner: "学习者",
  creator: "创作者",
  looped: "闭环达人",
};

export function WriteNextSteps({ wordCount, hasOutline }: Props) {
  const profile = useUserProfile();
  const stage = profile?.stage ?? "newcomer";

  const handleExport = useCallback(() => {
    trackEvent("report_exported", { from: "write", word_count: wordCount });
    window.print();
  }, [wordCount]);

  const options: NextStepOption[] = [];

  // 1. 写后分析 —— 字数够时优先提示（按钮在上方 WriteAnalysis 区）
  //    learner/creator 阶段强力推荐（推动闭环）
  if (wordCount >= 100) {
    const isLoopPush = stage === "learner" || stage === "creator";
    options.push({
      id: "write_analyze",
      label: "写后分析",
      hint: isLoopPush
        ? "↑ 完成首圈闭环：拆文 → 创作 → 写后分析"
        : "↑ 点击上方按钮，对作品运行 14 维度拆解",
      hintOnly: true,
      recommended: isLoopPush,
      priority: isLoopPush ? 100 : 90,
    });
  }

  // 2. 创建/完善大纲 —— 无大纲时高优先
  if (!hasOutline) {
    options.push({
      id: "create_outline",
      label: "创建结构大纲",
      hint:
        stage === "newcomer"
          ? "新手建议先搭骨架：钩子/三幕/反转，写起来不迷路"
          : "在左侧大纲区搭建钩子/三幕/反转骨架",
      priority: wordCount < 100 ? (stage === "newcomer" ? 95 : 90) : 70,
      recommended: stage === "newcomer" && wordCount < 100,
    });
  } else {
    options.push({
      id: "check_outline",
      label: "对照大纲检查",
      hint: "看底部结构提示，确认反转节点与情绪目标",
      priority: 60,
    });
  }

  // 3. 导出作品 —— 字数够时推荐（looped 阶段更优先）
  if (wordCount >= 500) {
    options.push({
      id: "export",
      label: "导出作品",
      hint: "通过浏览器打印为 PDF 存档",
      onClick: handleExport,
      priority: stage === "looped" ? 80 : 75,
    });
  }

  // 4. 查看双篇对比 —— 字数较多时（looped/creator 阶段更优先）
  if (wordCount >= 500) {
    const comparePriority =
      stage === "looped" ? 88 : stage === "creator" ? 85 : 55;
    options.push({
      id: "compare",
      label: "查看双篇对比",
      hint:
        stage === "creator" || stage === "looped"
          ? "对比你的作品与参考作品，找差异促闭环"
          : "写后分析后，对比你的作品与参考作品",
      href: "/compare",
      recommended: stage === "looped",
      priority: comparePriority,
    });
  }

  // 5. 收藏片段为素材 —— 字数较多时
  if (wordCount >= 200) {
    options.push({
      id: "save_material",
      label: "收藏片段为素材",
      hint: "选中精彩段落，拖入右侧素材栏收藏",
      hintOnly: true,
      priority: 40,
    });
  }

  // 6. newcomer 阶段：完成后引导去拆文学习（仅当字数少时推荐，避免干扰写作）
  if (stage === "newcomer" && wordCount < 100) {
    options.push({
      id: "teardown_learn",
      label: "拆解一篇优秀短篇",
      hint: "眼力是练出来的，多拆几篇找感觉",
      href: "/upload",
      priority: 50,
    });
  }

  // 字数太少时不展示（避免干扰初始写作）
  if (wordCount < 50) {
    return (
      <div className="rounded-sm border border-text bg-bg-alt p-3">
        <div className="text-xs text-text-muted">
          {wordCount === 0
            ? "开始写作后这里会显示下一步建议"
            : `已写 ${wordCount} 字，继续写吧`}
        </div>
      </div>
    );
  }

  const sorted = options.sort((a, b) => b.priority - a.priority).slice(0, 4);

  return (
    <div className="rounded-sm border border-accent bg-bg-alt p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-serif text-sm font-semibold text-text">下一步</h3>
        <span className="text-[10px] text-text-muted">
          {wordCount} 字
          {profile && (
            <span className="ml-2 rounded-sm border border-primary px-1 py-0.5 text-[9px] text-primary">
              {STAGE_LABEL[stage] || stage}
            </span>
          )}
        </span>
      </div>
      <div className="space-y-1.5">
        {sorted.map((opt) => {
          const disabled = opt.hintOnly;
          const content = (
            <div
              className={`flex items-center justify-between rounded-sm border px-2.5 py-1.5 transition-colors ${
                disabled
                  ? "border-primary/[0.16] bg-primary/[0.05]"
                  : "border-text bg-bg hover:border-primary hover:bg-primary/[0.05]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif text-xs font-medium text-text">
                    {opt.label}
                  </span>
                  {opt.recommended && (
                    <span className="rounded-sm border border-primary/[0.16] bg-primary/[0.05] px-1 text-[9px] text-primary">
                      推荐
                    </span>
                  )}
                  {opt.hintOnly && (
                    <span className="rounded-sm border border-primary px-1 text-[9px] text-primary">
                      可用
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {opt.hint}
                </p>
              </div>
              {!disabled && (
                <span className="ml-2 flex-shrink-0 text-xs text-primary">→</span>
              )}
            </div>
          );

          const handleClick = () => {
            trackEvent("writing_started", {
              from_source: "write_next_steps",
              next_step: opt.id,
              word_count: wordCount,
              user_stage: stage,
            });
            opt.onClick?.();
          };

          if (opt.onClick) {
            return (
              <button
                key={opt.id}
                type="button"
                onClick={handleClick}
                className="block w-full text-left"
              >
                {content}
              </button>
            );
          }

          if (opt.href && !opt.hintOnly) {
            return (
              <Link key={opt.id} href={opt.href} onClick={handleClick}>
                {content}
              </Link>
            );
          }

          return <div key={opt.id}>{content}</div>;
        })}
      </div>
    </div>
  );
}
