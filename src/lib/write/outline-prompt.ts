/**
 * 大纲生成 Prompt
 *
 * 圆桌讨论最终定稿：
 * - 章节数严格遵循 5 档规则
 * - coreGerm 透传自导语
 * - goldenFinger 为可选参数（未填则 LLM 禁止编造）
 * - 字段与 outline.ts WriteOutline 对齐 + 扩展 chapters
 * - 注入共享的去 AI 味规则与章节数规则
 */

import { ANTI_AI_RULES } from "./anti-ai-rules";
import { CHAPTER_COUNT_RULE } from "./chapter-rule";

export const OUTLINE_GENERATION_SYSTEM_PROMPT = `你是 InkSight 网文创作平台的资深大纲教练，擅长为短篇网络小说（3k-3w 字）生成可执行的结构大纲。

【职责】
根据用户提供的核心梗、题材、字数、情绪目标，输出包含三幕占比、反转节点、章节切分、结局类型的大纲。
- 大纲必须可直接喂给细纲生成 prompt
- 章节数严格遵循下表

${CHAPTER_COUNT_RULE}

【字段对齐 outline.ts（强制）】
- hookType: 钩子类型，枚举 ["suspense","action","character","atmosphere","dialogue","mixed"]
- threeActRatio: { setup, confrontation, resolution }，三数之和 = 1.0
- reversals: 反转节点数组，每项含 position(0-1) / type(plot/cognition/emotion) / note
- endingType: 结局类型，枚举 ["twist","open","circular","tragic","happy","ambiguous"]
- emotionGoal: 情绪曲线 {startMood, midMood, endMood, trend}

【字段定义（新增，仅生成期使用，不入 outline.ts）】
- coreGerm: 故事核心吸引力一句话（透传自导语或由 LLM 提炼）
- goldenFinger: 金手指描述（可选）。用户在 user prompt 填了则原样保留并在 chapters 中标注至少 1 个"金手指首次使用"节点；用户未填则省略此字段，禁止 LLM 自行编造金手指
- chapters: 章节大纲数组，每项含 index / title / wordCount / purpose / summary / keyEvents
- chapter.purpose 枚举：["hook","setup","development","confrontation","climax","resolution","transition"]（无 "paywall"）

【输出要求】
- 严格输出 JSON，不要 markdown 代码块
- 中文输出
- 三幕占比之和 = 1.0
- reversals 至少 1 个，position ∈ [0, 1]
- chapters 总 wordCount 之和 ≈ 用户字数目标（±10%）
- chapter.title 必须含动作或意象，禁"开端/发展/高潮/结局"等抽象标题

${ANTI_AI_RULES}`;

export interface OutlineGenerationInput {
  /** 题材 */
  theme: string;
  /** 核心梗（透传自导语） */
  coreGerm: string;
  /** 字数目标 */
  wordCount: number;
  /** 金手指（可选，留空则不强加） */
  goldenFinger?: string;
  /** 钩子类型（可选，来自导语选择，不填则 LLM 自选） */
  hookType?: string;
  /** 情绪目标（可选） */
  emotionGoal?: {
    startMood?: number;
    midMood?: number;
    endMood?: number;
    trend?: string;
  };
  /** 参考对标文（可选） */
  benchmark?: string;
  /** 三幕占比偏好（可选，不填则用默认 0.25/0.55/0.20） */
  threeActRatio?: {
    setup?: number;
    confrontation?: number;
    resolution?: number;
  };
}

/** 构造大纲生成的 user prompt */
export function buildOutlineGenerationUserPrompt(
  input: OutlineGenerationInput,
): string {
  const lines: string[] = ["请基于以下输入生成完整大纲：", ""];
  lines.push(`【题材】${input.theme}`);
  lines.push(`【核心梗】${input.coreGerm}`);
  lines.push(`【字数目标】${input.wordCount}`);
  lines.push(`【金手指（可选，留空则不强加）】${input.goldenFinger ?? ""}`);
  lines.push(
    `【钩子类型（可选，来自导语选择，不填则 LLM 自选）】${input.hookType ?? ""}`,
  );
  if (input.emotionGoal) {
    const e = input.emotionGoal;
    lines.push(
      `【情绪目标（可选）】startMood=${e.startMood ?? ""}, midMood=${e.midMood ?? ""}, endMood=${e.endMood ?? ""}, trend=${e.trend ?? ""}`,
    );
  }
  if (input.benchmark) lines.push(`【参考对标文（可选）】${input.benchmark}`);
  if (input.threeActRatio) {
    const t = input.threeActRatio;
    lines.push(
      `【三幕占比偏好（可选，不填则用默认 0.25/0.55/0.20）】setup=${t.setup ?? ""}, confrontation=${t.confrontation ?? ""}, resolution=${t.resolution ?? ""}`,
    );
  }

  lines.push("");
  lines.push("输出 JSON（仅 JSON，无 markdown 包裹）：");
  lines.push(JSON_TEMPLATE);

  return lines.join("\n");
}

const JSON_TEMPLATE = `{
  "coreGerm": "（透传自导语或由 LLM 提炼，≤40 字）",
  "goldenFinger": "（用户未填则省略此字段；填了则原样保留）",
  "hookType": "suspense",
  "hookNote": "（为何这样开篇，≤60 字）",
  "threeActRatio": { "setup": 0.25, "confrontation": 0.55, "resolution": 0.2 },
  "reversals": [
    { "position": 0.35, "type": "plot", "note": "（反转内容描述）" }
  ],
  "endingType": "twist",
  "emotionGoal": { "startMood": 0, "midMood": -3, "endMood": 2, "trend": "先抑后扬" },
  "chapters": [
    {
      "index": 1,
      "title": "（含动作或意象，禁抽象标题）",
      "wordCount": 1200,
      "purpose": "hook",
      "summary": "（80-120 字本章摘要）",
      "keyEvents": ["事件1", "事件2"]
    }
  ]
}`;
