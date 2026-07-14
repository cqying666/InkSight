/**
 * 导语生成 Prompt
 *
 * 圆桌讨论最终定稿：
 * - 输出 3 个差异化候选（覆盖不同 hookType）
 * - 同时输出 guideModel（结构抽象）+ coreGerm（内容抽象）
 * - 与 outline.ts 字段对齐
 * - 注入共享的去 AI 味规则
 */

import { ANTI_AI_RULES } from "./anti-ai-rules";

export const GUIDE_GENERATION_SYSTEM_PROMPT = `你是 InkSight 网文创作平台的资深导语教练，擅长为网络小说生成 80-150 字的开篇导语。

【职责】
根据用户提供的题材、核心梗、情绪目标，生成 3 个差异化导语候选。每个候选附带：
- guideModel：导语结构模型的一句话抽象（结构维度）
- coreGerm：故事核心吸引力的一句话描述（内容维度）

【guideModel 与 coreGerm 的区别（重要）】
- guideModel 是"结构抽象"，可复用于不同故事。例：「反差+悬念+痛点前置」
- coreGerm 是"内容抽象"，是这一个故事的辨识度。例：「重生回高三的学渣逆袭打脸渣男」
- 二者不可写成同一句话。

【输出要求】
- 严格输出 JSON，不要 markdown 代码块包裹
- 中文输出
- 每个 lead 80-150 字
- 3 个候选必须使用不同的 hookType（suspense/action/character/atmosphere/dialogue/mixed 各取一种）
- 3 个候选的 guideModel 必须互不相同

【字段定义（与 outline.ts 对齐）】
- hookType: 钩子类型，枚举 ["suspense","action","character","atmosphere","dialogue","mixed"]
- guideModel: 结构模型一句话，≤30 字
- coreGerm: 故事核心一句话，≤40 字
- lead: 导语正文 80-150 字
- hookNote: 钩子实现说明，≤60 字
- emotionGoal: 情绪曲线 {startMood(-5..5), midMood(-5..5), endMood(-5..5), trend}

${ANTI_AI_RULES}`;

export interface GuideGenerationInput {
  /** 题材 */
  theme: string;
  /** 核心梗（可选） */
  coreGerm?: string;
  /** 期望钩子类型（可选，不填则自动从 6 种中选 3 种） */
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
  /** 字数目标 */
  wordCount?: number;
}

/** 构造导语生成的 user prompt */
export function buildGuideGenerationUserPrompt(input: GuideGenerationInput): string {
  const lines: string[] = ["请基于以下输入生成 3 个差异化导语候选：", ""];
  lines.push(`【题材】${input.theme}`);
  lines.push(`【核心梗（可选）】${input.coreGerm ?? ""}`);
  lines.push(
    `【期望钩子类型（可选，不填则自动从 6 种中选 3 种）】${input.hookType ?? ""}`,
  );
  if (input.emotionGoal) {
    const e = input.emotionGoal;
    lines.push(
      `【情绪目标（可选）】startMood=${e.startMood ?? ""}, midMood=${e.midMood ?? ""}, endMood=${e.endMood ?? ""}, trend=${e.trend ?? ""}`,
    );
  }
  if (input.benchmark) lines.push(`【参考对标文（可选）】${input.benchmark}`);
  lines.push(`【字数目标】${input.wordCount ?? ""}`);

  lines.push("");
  lines.push("输出 JSON（仅 JSON，无 markdown 包裹）：");
  lines.push(JSON_TEMPLATE);

  return lines.join("\n");
}

const JSON_TEMPLATE = `{
  "candidates": [
    {
      "hookType": "suspense",
      "guideModel": "（结构抽象，如：反差+悬念+痛点前置）",
      "coreGerm": "（内容抽象，如：重生回高三的学渣逆袭打脸渣男）",
      "lead": "（80-150 字导语正文）",
      "hookNote": "（为何这样开篇，≤60 字）",
      "emotionGoal": {
        "startMood": 0,
        "midMood": -3,
        "endMood": 2,
        "trend": "先抑后扬"
      }
    }
  ]
}`;

/** 导语生成 prompt 输出的单个候选 */
export interface GuideCandidate {
  hookType: string;
  guideModel: string;
  coreGerm: string;
  lead: string;
  hookNote: string;
  emotionGoal: {
    startMood: number;
    midMood: number;
    endMood: number;
    trend: string;
  };
}

export interface GuideGenerationResult {
  candidates: GuideCandidate[];
}
