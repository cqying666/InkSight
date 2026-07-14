/**
 * 章节大纲类型（生成期类型，不入 outline.ts schema）
 *
 * 圆桌讨论决策：
 * - P5-T4 已冻结的 WriteOutline schema 保持不变
 * - chapters/scenes 仅作为生成期类型存在，提供类型校验
 * - 后续 Phase 升级时再评估是否持久化
 */

import type { EndingType, HookType } from "./outline";

/** 章节在叙事中的功能 */
export type ChapterPurpose =
  | "hook"
  | "setup"
  | "development"
  | "confrontation"
  | "climax"
  | "resolution"
  | "transition";

export const CHAPTER_PURPOSE_LABELS: Record<ChapterPurpose, string> = {
  hook: "钩子",
  setup: "铺垫",
  development: "发展",
  confrontation: "冲突",
  climax: "高潮",
  resolution: "收束",
  transition: "过渡",
};

/** 章节大纲（生成期结构，扩展于 outline.ts 的 WriteOutline） */
export interface ChapterPlan {
  index: number;
  /** 章节标题（含动作或意象，禁抽象标题） */
  title: string;
  /** 本章字数 */
  wordCount: number;
  /** 本章叙事功能 */
  purpose: ChapterPurpose;
  /** 本章摘要 80-150 字 */
  summary: string;
  /** 本章关键事件 */
  keyEvents: string[];
  /** 章末钩子（可选） */
  hook?: string;
}

/** 大纲生成 prompt 的完整输出 */
export interface OutlineGenerationResult {
  /** 故事核心吸引力一句话（透传自导语或由 LLM 提炼，≤40 字） */
  coreGerm: string;
  /** 金手指描述（用户未填则省略） */
  goldenFinger?: string;
  /** 钩子类型 */
  hookType: HookType;
  /** 钩子实现说明 */
  hookNote: string;
  /** 三幕占比 */
  threeActRatio: {
    setup: number;
    confrontation: number;
    resolution: number;
  };
  /** 反转节点 */
  reversals: Array<{
    position: number;
    type: "plot" | "cognition" | "emotion";
    note: string;
  }>;
  /** 结局类型 */
  endingType: EndingType;
  /** 情绪曲线 */
  emotionGoal: {
    startMood: number;
    midMood: number;
    endMood: number;
    trend: string;
  };
  /** 章节大纲数组 */
  chapters: ChapterPlan[];
}
