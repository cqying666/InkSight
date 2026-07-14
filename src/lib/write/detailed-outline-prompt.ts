/**
 * 细纲生成 Prompt
 *
 * 圆桌讨论最终定稿：
 * - 严格沿用大纲的章节数（不增删合并）
 * - 每章 3-6 个 scene
 * - scene.purpose 无 paywall（InkSight 非发布平台）
 * - 若大纲含 goldenFinger，必须在金手指首次出现章节安排 scene 显式呈现
 * - 注入共享的去 AI 味规则
 */

import { ANTI_AI_RULES } from "./anti-ai-rules";

export const DETAILED_OUTLINE_GENERATION_SYSTEM_PROMPT = `你是 InkSight 网文创作平台的资深细纲教练，擅长将大纲章节拆解为可执行的 scene 级别细纲。

【职责】
根据用户提供的大纲文本（可能是结构化 JSON 或可读文本），为每一章生成 3-6 个 scene，每个 scene 含目的、字数、内容描述、关键对白、情绪锚点。

【入参兼容】
- 用户传入的大纲可能是结构化 JSON，也可能是人类可读的文本格式（如【核心梗】xxx / 第 1 章 ... 等）
- 若为可读文本，请自行理解其结构，识别出核心梗、章节列表、每章字数与摘要等信息
- 章节数严格沿用大纲中识别到的章节数，不可新增、删除或合并章节

【章节数规则（强制）】
- 严格沿用大纲的章节数，不可新增章节、不可删除章节、不可合并章节
- 章节序号必须与大纲中的章节一一对应（从 1 起）
- 每章 3-6 个 scene，总 scene 字数 ≈ 该章 wordCount（±10%）；若大纲未给出字数，按 1500-2500 字估算

【字段定义】
- chapterIndex: 章节序号（与大纲对齐，从 1 起）
- scenes: scene 数组
- scene.purpose: 场景在叙事中的功能，枚举 ["hook","setup","development","confrontation","climax","resolution","transition"]（无 "paywall"）
- scene.wordCount: 本场景字数
- scene.content: 80-150 字内容描述（必须有具体动作或意象）
- scene.dialogue: 关键对白（可选，使用「」包裹，≤40 字）
- scene.emotionPoint: 本场景情绪锚点 -5 到 5

【字段对齐】
- 不输出 paywall 字段（InkSight 非发布平台）
- 不输出与 outline.ts 无关的发布期字段

【输出要求】
- 严格输出 JSON，不要 markdown 代码块
- 中文输出
- scene.content 禁纯抽象描写
- scene.dialogue 使用「」，不使用 "" 或 ""
- 若大纲包含 goldenFinger，必须在金手指首次出现的章节安排一个 scene 显式呈现金手指的"获得"或"激活"

${ANTI_AI_RULES}`;

export interface DetailedOutlineGenerationInput {
  /** 大纲文本（可为结构化 JSON 字符串或可读文本） */
  outlineJson: string;
  /** 核心梗（可选，未提供则 LLM 从大纲自行提炼） */
  coreGerm?: string;
  /** 字数目标（可选，未提供则 LLM 从大纲自行估算） */
  wordCount?: number;
  /** 钩子类型（可选，未提供则 LLM 从大纲自行识别） */
  hookType?: string;
  /** 金手指（可选，无则留空） */
  goldenFinger?: string;
  /** 情绪目标（可选） */
  emotionGoal?: {
    startMood?: number;
    midMood?: number;
    endMood?: number;
    trend?: string;
  };
}

/** 构造细纲生成的 user prompt */
export function buildDetailedOutlineGenerationUserPrompt(
  input: DetailedOutlineGenerationInput,
): string {
  const lines: string[] = ["请基于以下输入生成细纲：", ""];
  lines.push("【大纲文本】");
  lines.push(input.outlineJson);
  lines.push("");
  if (input.coreGerm) lines.push(`【核心梗】${input.coreGerm}`);
  if (input.wordCount) lines.push(`【字数目标】${input.wordCount}`);
  if (input.hookType) lines.push(`【钩子类型】${input.hookType}`);
  if (input.goldenFinger) lines.push(`【金手指】${input.goldenFinger}`);
  if (input.emotionGoal) {
    const e = input.emotionGoal;
    lines.push(
      `【情绪目标】startMood=${e.startMood ?? ""}, midMood=${e.midMood ?? ""}, endMood=${e.endMood ?? ""}, trend=${e.trend ?? ""}`,
    );
  }

  lines.push("");
  lines.push("输出 JSON（仅 JSON，无 markdown 包裹）：");
  lines.push(JSON_TEMPLATE);

  return lines.join("\n");
}

const JSON_TEMPLATE = `{
  "chapterBreakdown": [
    {
      "chapterIndex": 1,
      "scenes": [
        {
          "purpose": "hook",
          "wordCount": 300,
          "content": "（80-150 字，含具体动作或意象）",
          "dialogue": "「关键对白，可选」",
          "emotionPoint": -2
        }
      ]
    }
  ]
}`;
