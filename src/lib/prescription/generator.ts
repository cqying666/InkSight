import { z } from "zod";
import { callLLMWithSchema } from "../llm/client";
import type { DiagnosisFinding, DiagnosisResult } from "../diagnosis/engine";
import type { TeardownResult } from "../teardown/schema";

/**
 * 处方生成 (P1-T3)
 *
 * 针对每个薄弱点，生成 2-3 个方向的修改建议
 * 严格遵守"三不原则"：
 *   1. 不替写具体文字
 *   2. 不给唯一答案
 *   3. 不做好坏评判
 *
 * 每个建议包含：方向描述、适配性评分(1-5)、操作方法、参考案例、预期效果
 */

// ===== 处方 Schema =====

export const PrescriptionSuggestion = z.object({
  /** 方向名称（简短，如"前置反转节点"） */
  direction: z.string().describe("方向名称"),
  /** 方向描述（一段话说明这个方向的核心思路） */
  description: z.string().describe("方向核心思路描述"),
  /** 适配性评分 1-5（基于小说风格特征） */
  compatibilityScore: z.coerce.number().min(1).max(5).describe("适配性评分 1-5"),
  /** 具体操作方法（2-4 条可执行步骤） */
  methods: z.array(z.string()).min(2).max(4).describe("操作方法步骤"),
  /** 参考案例（描述性引用，不引用原文） */
  referenceCase: z.string().describe("参考案例描述"),
  /** 预期效果 */
  expectedEffect: z.string().describe("预期效果"),
});

export const PrescriptionForWeakness = z.object({
  /** 对应的薄弱点标签 */
  weaknessLabel: z.string().describe("对应的薄弱点名称"),
  /** 该薄弱点的 2-3 个方向建议 */
  suggestions: z.array(PrescriptionSuggestion).min(2).max(3),
});

export const PrescriptionSchema = z.array(PrescriptionForWeakness).min(1);

export type PrescriptionItem = z.infer<typeof PrescriptionForWeakness>;
export type Suggestion = z.infer<typeof PrescriptionSuggestion>;
export type Prescription = z.infer<typeof PrescriptionSchema>;

// ===== Prompt 设计 =====

const SYSTEM_PROMPT = `你是一位资深短篇小说编辑，正在为创作者提供结构改进建议。

## 核心原则 —— "三不原则"

1. **不替写具体文字**：永远不要替作者写出具体句子、段落。只提供方向、方法、思路
2. **不给唯一答案**：每个薄弱点必须给出 2-3 个不同方向，让作者自己选择
3. **不做好坏评判**：不用"好/坏/对/错"评价作者的作品，只描述"如何调整可以改变效果"

## 建议质量要求

- **适配性**：建议必须基于该小说的实际风格特征，不能是万能套话
- **可执行**：方法步骤要具体，作者看完知道该做什么
- **有参考**：参考案例用描述性引用（如"某悬疑短篇常用..."），不要引用具体作品原文
- **多元方向**：2-3 个建议要有明显差异，覆盖不同创作选择

## 输出格式

只输出合法 JSON 数组，每个元素对应一个薄弱点：

[
  {
    "weaknessLabel": "薄弱点名称",
    "suggestions": [
      {
        "direction": "方向简称",
        "description": "方向核心思路（一段话）",
        "compatibilityScore": 4,
        "methods": ["步骤1", "步骤2", "步骤3"],
        "referenceCase": "参考案例描述",
        "expectedEffect": "预期效果描述"
      }
    ]
  }
]

compatibilityScore 评分标准：
- 5：高度适配，几乎不改变原有风格
- 4：较适配，微调即可
- 3：中性，需要一定调整
- 2：挑战较大，会改变部分风格
- 1：实验性，大胆尝试

适配度高的方向排在前面。`;

function buildUserPrompt(
  teardown: TeardownResult,
  diagnosis: DiagnosisResult
): string {
  const weaknessesInfo = diagnosis.weaknesses
    .map((w: DiagnosisFinding) => ({
      label: w.label,
      userValue: w.userValue,
      baseline: w.baselineMean,
      deviation: `${w.deviationPct}%`,
      diagnosis: w.diagnosis,
    }))
    .map((w, i) => `### 薄弱点 ${i + 1}：${w.label}
- 用户值: ${w.userValue}
- 同类基准: ${w.baseline}
- 偏差: ${w.deviation}
- 诊断: ${w.diagnosis}`)
    .join("\n\n");

  return `请基于以下拆解结果与诊断，为每个薄弱点提供 2-3 个方向的修改建议。

## 小说基本信息

- 类型：${teardown.type}
- 总评：${teardown.summary}
- 字数：${teardown.wordCount}

## 关键风格特征（用于判断建议适配性）

- 钩子类型：${teardown.skeleton.hookType}（强度 ${teardown.skeleton.hookStrength}）
- 三幕占比：建置 ${teardown.skeleton.threeActRatio.setup} / 对抗 ${teardown.skeleton.threeActRatio.confrontation} / 解决 ${teardown.skeleton.threeActRatio.resolution}
- 反转数量：${teardown.skeleton.reversals.length}
- 对话占比：${teardown.flesh.dialogueRatio}
- 情绪范围：${teardown.flesh.emotionRange.min} 到 ${teardown.flesh.emotionRange.max}
- 主导冲突：${teardown.flesh.conflictLayers.dominantConflict}
- 平均句长：${teardown.style.sentenceStyle.avgLength} 字
- 视角：${teardown.style.perspective}

## 需要处方建议的薄弱点

${weaknessesInfo}

## 要求

1. 严格遵循"三不原则"
2. 每个薄弱点给出 2-3 个**不同**方向的建议
3. 建议要适配这部小说的风格特征
4. 输出合法 JSON 数组，不要包含 markdown 代码块或额外文字`;
}

// ===== 处方生成主函数 =====

export async function generatePrescription(
  teardown: TeardownResult,
  diagnosis: DiagnosisResult
): Promise<{
  data: Prescription;
  durationMs: number;
  tokens: number;
}> {
  // 如果没有薄弱点，返回空处方
  if (diagnosis.weaknesses.length === 0) {
    return { data: [], durationMs: 0, tokens: 0 };
  }

  const { data, raw } = await callLLMWithSchema({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(teardown, diagnosis),
    temperature: 0.5, // 处方需要一定创造性，温度稍高
    jsonMode: true,
    maxAttempts: 2,
    validate: (parsed) => PrescriptionSchema.safeParse(parsed),
  });

  return {
    data,
    durationMs: raw.durationMs,
    tokens: raw.usage.totalTokens,
  };
}
