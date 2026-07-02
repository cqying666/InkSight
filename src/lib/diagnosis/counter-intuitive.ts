import type { TeardownResult } from "../teardown/schema";
import type { DiagnosisResult } from "../diagnosis/engine";

/**
 * 反直觉发现 (P1-T4)
 *
 * 对比"创作者自评"与"分析结果"的最大偏差点，
 * 识别 1-2 个"创作者自己可能没意识到的结构特征"
 *
 * 自评维度（来自 PRD 5.1 功能 1）：
 * - 开头吸引力 1-5 分
 * - 最有张力的位置
 * - 整体节奏快慢
 *
 * 如果没有自评数据，则从拆解结果中提取最反直觉的发现
 */

export interface SelfAssessment {
  /** 开头吸引力自评 1-5 */
  hookRating?: number;
  /** 最有张力的位置（0-1） */
  tensionPosition?: number;
  /** 整体节奏：fast / medium / slow */
  pace?: "fast" | "medium" | "slow";
}

export interface CounterIntuitiveFinding {
  /** 发现标题 */
  title: string;
  /** 发现描述 */
  description: string;
  /** 自评值（如有） */
  selfValue?: string;
  /** 实际分析值 */
  actualValue: string;
  /** 启发（为什么这个发现重要） */
  insight: string;
}

// ===== 反直觉发现生成 =====

export function findCounterIntuitive(
  teardown: TeardownResult,
  selfAssessment?: SelfAssessment
): CounterIntuitiveFinding[] {
  const findings: CounterIntuitiveFinding[] = [];

  if (selfAssessment) {
    // 有自评：对比自评与分析结果
    findings.push(...compareWithSelfAssessment(teardown, selfAssessment));
  }

  // 无论有无自评，都补充结构性反直觉发现
  findings.push(...findStructuralSurprises(teardown));

  // 去重并取前 2 个
  const unique = dedupeFindings(findings);
  return unique.slice(0, 2);
}

// ===== 自评对比 =====

function compareWithSelfAssessment(
  teardown: TeardownResult,
  self: SelfAssessment
): CounterIntuitiveFinding[] {
  const findings: CounterIntuitiveFinding[] = [];

  // 1. 开头吸引力对比
  if (self.hookRating !== undefined) {
    const actualHook = teardown.skeleton.hookStrength;
    const diff = actualHook - self.hookRating;

    if (Math.abs(diff) >= 1) {
      const direction = diff > 0 ? "实际上更强" : "实际上更弱";
      findings.push({
        title: `开头钩子：你以为 ${self.hookRating} 分，实际 ${direction}`,
        description: `你对开头吸引力的自我感知（${self.hookRating}/5）与结构分析（${actualHook}/5）存在明显偏差`,
        selfValue: `${self.hookRating}/5`,
        actualValue: `${actualHook}/5`,
        insight:
          diff > 0
            ? "你的开头比你以为的更有力——你可能低估了自己的钩子设计"
            : "你的开头可能没有达到你预期的吸引力——检查是否缺少悬念或冲突前置",
      });
    }
  }

  // 2. 张力位置对比
  if (self.tensionPosition !== undefined) {
    // 找到情绪曲线的最高点位置
    const peakPoint = teardown.flesh.emotionCurve.reduce((max, p) =>
      p.emotion > max.emotion ? p : max
    );
    const diff = Math.abs(peakPoint.position - self.tensionPosition);

    if (diff >= 0.15) {
      const selfPct = Math.round(self.tensionPosition * 100);
      const actualPct = Math.round(peakPoint.position * 100);
      findings.push({
        title: `最有张力的位置：你以为在 ${selfPct}%，实际在 ${actualPct}%`,
        description: `你感知的张力高潮位置与文本实际情绪峰值位置相差约 ${Math.round(
          diff * 100
        )}%`,
        selfValue: `全文 ${selfPct}% 处`,
        actualValue: `全文 ${actualPct}% 处（${peakPoint.label}）`,
        insight:
          peakPoint.position > self.tensionPosition
            ? "真正的张力高潮比你以为的来得更晚——前半段可能铺垫过长"
            : "真正的张力高潮比你以为的来得更早——后段可能缺少持续张力",
      });
    }
  }

  // 3. 节奏对比
  if (self.pace !== undefined) {
    const density = teardown.skeleton.eventDensity;
    let actualPace: "fast" | "medium" | "slow";
    if (density >= 5) actualPace = "fast";
    else if (density >= 3) actualPace = "medium";
    else actualPace = "slow";

    if (actualPace !== self.pace) {
      const paceMap = { fast: "快", medium: "中等", slow: "慢" };
      findings.push({
        title: `整体节奏：你以为${paceMap[self.pace]}，实际${paceMap[actualPace]}`,
        description: `你感知的节奏（${paceMap[self.pace]}）与事件密度分析（${density.toFixed(
          1
        )}/千字，${paceMap[actualPace]}）不一致`,
        selfValue: paceMap[self.pace],
        actualValue: `${paceMap[actualPace]}（${density.toFixed(1)}/千字）`,
        insight:
          actualPace === "fast"
            ? "事件比你感知的更密集——读者可能会觉得节奏紧，注意留白"
            : actualPace === "slow"
            ? "事件比你感知的更稀疏——读者可能会觉得拖沓，考虑压缩"
            : "节奏其实比较均衡，但你的感知有偏差",
      });
    }
  }

  return findings;
}

// ===== 结构性反直觉发现（无需自评） =====

function findStructuralSurprises(
  teardown: TeardownResult
): CounterIntuitiveFinding[] {
  const findings: CounterIntuitiveFinding[] = [];

  // 发现 1：反转位置过晚
  if (teardown.skeleton.reversals.length > 0) {
    const lastReversal = teardown.skeleton.reversals[
      teardown.skeleton.reversals.length - 1
    ];
    if (lastReversal.position > 0.85) {
      findings.push({
        title: `最后的反转出现在 ${Math.round(
          lastReversal.position * 100
        )}%，非常靠后`,
        description: `主要反转节点集中在全文末尾，前 80% 缺少结构性转折`,
        actualValue: `反转位置 ${Math.round(lastReversal.position * 100)}%`,
        insight:
          "反转过晚会导致前半段缺少钩子，读者可能在反转到来前流失。考虑在 40-60% 位置安排一个中段反转",
      });
    }
  } else if (teardown.type === "plot-driven") {
    // 情节驱动型却没识别出反转
    findings.push({
      title: "作为情节驱动型小说，却没有明显的反转结构",
      description: "整篇缺少结构性反转，依靠线性推进",
      actualValue: "反转数量 0",
      insight:
        "情节驱动型小说通常依赖反转制造张力。可考虑增加 1-2 个转折点，或在叙事中埋下伏笔",
    });
  }

  // 发现 2：对话与叙述失衡
  const dialogueRatio = teardown.flesh.dialogueRatio;
  if (dialogueRatio > 0.6) {
    findings.push({
      title: `对话占比高达 ${Math.round(dialogueRatio * 100)}%`,
      description: "文本以对话为主，叙述描写相对单薄",
      actualValue: `对话 ${Math.round(dialogueRatio * 100)}%`,
      insight:
        "高对话比能加快节奏，但缺少叙述铺垫会让场景感薄弱。可在对话间隙穿插环境与心理描写",
    });
  } else if (dialogueRatio < 0.15 && teardown.type !== "atmosphere-driven") {
    findings.push({
      title: `对话占比仅 ${Math.round(dialogueRatio * 100)}%`,
      description: "文本几乎完全依赖叙述，缺少对话",
      actualValue: `对话 ${Math.round(dialogueRatio * 100)}%`,
      insight:
        "低对话比会让人物声音缺席。可考虑用对话呈现关键冲突，让人物自己'说话'",
    });
  }

  // 发现 3：情绪幅度过小
  const emotionRange = teardown.flesh.emotionRange;
  const amplitude = emotionRange.max - emotionRange.min;
  if (amplitude < 3) {
    findings.push({
      title: `情绪幅度仅 ${amplitude.toFixed(1)}（${emotionRange.min} 到 ${
        emotionRange.max
      }）`,
      description: "情绪曲线较为平坦，缺少明显的起伏",
      actualValue: `情绪幅度 ${amplitude.toFixed(1)}`,
      insight:
        "平坦的情绪曲线难以调动读者。可考虑在关键节点制造更强烈的情绪反差",
    });
  }

  // 发现 4：感官描写单一
  const sensory = teardown.flesh.sensoryFrequency;
  const sensoryValues = [
    sensory.visual,
    sensory.auditory,
    sensory.tactile,
    sensory.olfactory,
    sensory.gustatory,
  ];
  const nonZeroSenses = sensoryValues.filter((v) => v > 0).length;
  if (nonZeroSenses <= 1 && teardown.type !== "plot-driven") {
    findings.push({
      title: `感官描写仅覆盖 ${nonZeroSenses} 种感官`,
      description: "主要依赖单一感官，沉浸感受限",
      actualValue: `${nonZeroSenses}/5 种感官`,
      insight:
        "多感官联动能增强场景沉浸感。可尝试加入听觉、触觉等非视觉描写",
    });
  }

  return findings;
}

// ===== 去重 =====

function dedupeFindings(
  findings: CounterIntuitiveFinding[]
): CounterIntuitiveFinding[] {
  const seen = new Set<string>();
  const result: CounterIntuitiveFinding[] = [];
  for (const f of findings) {
    const key = f.title.slice(0, 20);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
}
