/**
 * 场景细纲类型（生成期类型，不入 outline.ts schema）
 */

import type { ChapterPurpose } from "./chapter";

/** 场景在叙事中的功能（与 ChapterPurpose 对齐，无 paywall） */
export type ScenePurpose = ChapterPurpose;

export const SCENE_PURPOSE_LABELS: Record<ScenePurpose, string> = {
  hook: "钩子",
  setup: "铺垫",
  development: "发展",
  confrontation: "冲突",
  climax: "高潮",
  resolution: "收束",
  transition: "过渡",
};

/** 单个场景的细纲 */
export interface ScenePlan {
  /** 场景在叙事中的功能 */
  purpose: ScenePurpose;
  /** 本场景字数 */
  wordCount: number;
  /** 80-150 字内容描述（含具体动作或意象） */
  content: string;
  /** 关键对白（可选，使用「」包裹，≤40 字） */
  dialogue?: string;
  /** 本场景情绪锚点 -5 到 5 */
  emotionPoint: number;
}

/** 一章的细纲 */
export interface ChapterBreakdown {
  /** 章节序号（与大纲 chapters[].index 一一对应，从 1 起） */
  chapterIndex: number;
  /** 本章场景数组（3-6 个） */
  scenes: ScenePlan[];
}

/** 细纲生成 prompt 的完整输出 */
export interface DetailedOutlineResult {
  chapterBreakdown: ChapterBreakdown[];
}
