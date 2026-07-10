/**
 * P5-T4 结构大纲数据模型 + 存储
 *
 * PRD 5.7：大纲要素 = 钩子类型 + 三幕占比 + 反转节点 + 结局类型 + 情绪曲线目标
 * 来源：从拆文结果选择 / 自定义（素材库模板待 Phase 4 完成后接入）
 */

const OUTLINE_KEY = "inksight:write:outline";

export type HookType =
  | "suspense"
  | "action"
  | "character"
  | "atmosphere"
  | "dialogue"
  | "mixed";

export type ReversalType = "plot" | "cognition" | "emotion";

export type EndingType =
  | "twist"
  | "open"
  | "circular"
  | "tragic"
  | "happy"
  | "ambiguous";

export interface ReversalPlan {
  position: number; // 0-1 全文占比
  type: ReversalType;
  note: string; // 反转内容描述
}

export interface WriteOutline {
  hookType: HookType;
  hookNote: string;
  threeActRatio: {
    setup: number; // 0-1
    confrontation: number;
    resolution: number;
  };
  reversals: ReversalPlan[];
  endingType: EndingType;
  emotionGoal: {
    startMood: number; // -5 to 5
    midMood: number;
    endMood: number;
    trend: string;
  };
  createdAt: number;
  updatedAt: number;
}

export const HOOK_LABELS: Record<HookType, string> = {
  suspense: "悬念型",
  action: "动作型",
  character: "人物型",
  atmosphere: "氛围型",
  dialogue: "对话型",
  mixed: "混合型",
};

export const REVERSAL_LABELS: Record<ReversalType, string> = {
  plot: "情节反转",
  cognition: "认知反转",
  emotion: "情感反转",
};

export const ENDING_LABELS: Record<EndingType, string> = {
  twist: "反转结局",
  open: "开放结局",
  circular: "环形结局",
  tragic: "悲剧结局",
  happy: "圆满结局",
  ambiguous: "模糊结局",
};

/**
 * 默认空大纲
 */
export function createEmptyOutline(): WriteOutline {
  return {
    hookType: "suspense",
    hookNote: "",
    threeActRatio: { setup: 0.25, confrontation: 0.55, resolution: 0.2 },
    reversals: [{ position: 0.35, type: "plot", note: "" }],
    endingType: "twist",
    emotionGoal: {
      startMood: -1,
      midMood: -3,
      endMood: 2,
      trend: "先抑后扬",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 从拆文结果生成大纲模板（学→创衔接）
 * 基于新 AnalysisResult 的 PlotAnalysis 结构，提取关键要素作为大纲起点
 */
export function outlineFromTeardown(plot: {
  sixCoreElements: {
    framework: { coreAttractionType: string };
    satisfactionPoint: { type: string };
  };
  plotEmotionFlow: {
    chapterEvents: Array<{
      chapter: string;
      events: Array<{ event: string; content: string }>;
    }>;
    emotionProgressionChain: {
      initialEmotion?: string;
      maxPressure?: string;
    };
  };
}): WriteOutline {
  const now = Date.now();

  // 钩子类型：从核心吸引力类型推断
  const coreAttr = plot.sixCoreElements.framework.coreAttractionType;
  let hookType: HookType = "mixed";
  if (/悬念/.test(coreAttr)) hookType = "suspense";
  else if (/动作/.test(coreAttr)) hookType = "action";
  else if (/人物/.test(coreAttr)) hookType = "character";
  else if (/氛围/.test(coreAttr)) hookType = "atmosphere";
  else if (/对话/.test(coreAttr)) hookType = "dialogue";

  // 反转节点：从 chapterEvents 中提取"反转点"事件
  const reversals: ReversalPlan[] = [];
  const chapters = plot.plotEmotionFlow.chapterEvents;
  const totalChapters = chapters.length || 1;
  chapters.forEach((ch, chIdx) => {
    ch.events.forEach((ev) => {
      if (/反转/.test(ev.event)) {
        reversals.push({
          position: Math.min(0.95, (chIdx + 0.5) / totalChapters),
          type: /认知/.test(ev.event)
            ? "cognition"
            : /情感/.test(ev.event)
              ? "emotion"
              : "plot",
          note: ev.content,
        });
      }
    });
  });
  if (reversals.length === 0) {
    reversals.push({ position: 0.5, type: "plot", note: "" });
  }

  // 结局类型：从爽点类型推断
  const satType = plot.sixCoreElements.satisfactionPoint.type;
  let endingType: EndingType = "open";
  if (/反转/.test(satType)) endingType = "twist";
  else if (/悲剧/.test(satType)) endingType = "tragic";
  else if (/圆满/.test(satType)) endingType = "happy";

  return {
    hookType,
    hookNote: "基于拆文结果的结构模式",
    threeActRatio: { setup: 0.25, confrontation: 0.55, resolution: 0.2 },
    reversals,
    endingType,
    emotionGoal: {
      startMood: 0,
      midMood: -3,
      endMood: 2,
      trend: "参考拆文情绪走向",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function loadOutline(): WriteOutline | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OUTLINE_KEY);
    return raw ? (JSON.parse(raw) as WriteOutline) : null;
  } catch {
    return null;
  }
}

export function saveOutline(outline: WriteOutline): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OUTLINE_KEY, JSON.stringify(outline));
  } catch {
    // ignore
  }
}

export function clearOutline(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OUTLINE_KEY);
}

export { OUTLINE_KEY };
