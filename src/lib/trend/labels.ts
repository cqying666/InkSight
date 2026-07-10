/**
 * 题材与元素标签词表（共享常量）
 *
 * 抽到独立模块避免 mock-collector ↔ classifier/prompts 循环依赖。
 * 所有需要 GENRE_POOL / ELEMENT_POOL 的模块都从这里导入。
 */

/** 题材标签预置词表（10 类） */
export const GENRE_POOL = [
  "悬疑",
  "言情",
  "治愈",
  "复仇",
  "重生",
  "穿越",
  "宫斗",
  "日常",
  "科幻",
  "惊悚",
] as const;

/** 元素标签预置词表（10 类） */
export const ELEMENT_POOL = [
  "反转",
  "虐心",
  "甜宠",
  "爽感",
  "群像",
  "悬念",
  "系统",
  "重生",
  "复仇",
  "双强",
] as const;

/** 题材标签中文列表（LLM prompt 用） */
export const GENRE_LABELS: string[] = [...GENRE_POOL];

/** 元素标签中文列表（LLM prompt 用） */
export const ELEMENT_LABELS: string[] = [...ELEMENT_POOL];
