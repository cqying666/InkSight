/**
 * 章节数自适应规则（共享常量）
 *
 * 大纲生成与细纲生成共用同一份规则，避免两套规则在分界点不一致。
 * 由圆桌讨论决策：采用大纲组规则 + 补 ≤3000 字档位（共 5 档）。
 *
 * 在分界点附近允许 ±1 章弹性，但章节数必须落在区间内。
 */

export const CHAPTER_COUNT_RULE = `【章节数自适应规则（强制，5 档）】
- ≤3000 字 → 2-3 章
- 3000-5000 字 → 3-4 章
- 5000-10000 字 → 4-8 章
- 10000-20000 字 → 7-15 章
- 20000-30000 字 → 12-22 章
（在分界点附近允许 ±1 章弹性，但章节数必须落在区间内）`;

/** 根据字数推断章节数区间 */
export function getChapterCountRange(wordCount: number): {
  min: number;
  max: number;
} {
  if (wordCount <= 3000) return { min: 2, max: 3 };
  if (wordCount <= 5000) return { min: 3, max: 4 };
  if (wordCount <= 10000) return { min: 4, max: 8 };
  if (wordCount <= 20000) return { min: 7, max: 15 };
  return { min: 12, max: 22 };
}
