import type { TeardownResult, NovelTypeValue } from "../src/lib/teardown/schema";

/**
 * 合成种子生成器（P3-T1 bootstrap）
 *
 * 用途：在真实 100 篇语料未到位前，生成 schema-valid 的合成拆解结果，
 *      用于 P3-T2 基准库聚合的端到端验证与基准替换。
 *
 * 设计原则：
 *  - 严格符合 TeardownResult schema（P3-T2 聚合器与诊断引擎可直接消费）
 *  - 按类型参数化：plot-driven 反转多/事件密度高；emotion-driven 情绪幅度大；
 *    atmosphere-driven 感官丰富/事件密度低；mixed 居中
 *  - 每篇带随机扰动（基于种子），避免基准退化为单点
 *  - 真实 100 篇到位后，聚合器自动优先用真实数据，合成数据可清理
 */

// 简单可复现 PRNG（线性同余），保证脚本可重跑
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jitter(rng: () => number, base: number, spread: number): number {
  return base + (rng() - 0.5) * 2 * spread;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

interface TypeProfile {
  type: NovelTypeValue;
  hookStrength: [number, number]; // [base, spread]
  eventDensity: [number, number];
  reversalsRange: [number, number];
  threeAct: { setup: [number, number]; confrontation: [number, number]; resolution: [number, number] };
  emotionMax: [number, number];
  emotionMin: [number, number];
  dialogueRatio: [number, number];
  sensoryTotal: [number, number];
  avgSentenceLength: [number, number];
  conflictInterpersonal: [number, number];
  conflictInternal: [number, number];
}

const PROFILES: Record<NovelTypeValue, TypeProfile> = {
  "plot-driven": {
    type: "plot-driven",
    hookStrength: [4, 0.6],
    eventDensity: [5.5, 1.5],
    reversalsRange: [2, 5],
    threeAct: { setup: [0.3, 0.08], confrontation: [0.55, 0.08], resolution: [0.15, 0.05] },
    emotionMax: [3.5, 1],
    emotionMin: [-3.5, 1],
    dialogueRatio: [0.4, 0.12],
    sensoryTotal: [8, 3],
    avgSentenceLength: [18, 5],
    conflictInterpersonal: [0.6, 0.12],
    conflictInternal: [0.25, 0.1],
  },
  "emotion-driven": {
    type: "emotion-driven",
    hookStrength: [3.5, 0.7],
    eventDensity: [3, 1],
    reversalsRange: [1, 3],
    threeAct: { setup: [0.35, 0.08], confrontation: [0.45, 0.1], resolution: [0.2, 0.06] },
    emotionMax: [4, 1],
    emotionMin: [-4, 1],
    dialogueRatio: [0.4, 0.13],
    sensoryTotal: [8, 3],
    avgSentenceLength: [25, 7],
    conflictInterpersonal: [0.4, 0.12],
    conflictInternal: [0.5, 0.13],
  },
  "atmosphere-driven": {
    type: "atmosphere-driven",
    hookStrength: [3, 0.7],
    eventDensity: [2.5, 1],
    reversalsRange: [0, 2],
    threeAct: { setup: [0.4, 0.08], confrontation: [0.4, 0.1], resolution: [0.2, 0.06] },
    emotionMax: [2.5, 1],
    emotionMin: [-2, 1],
    dialogueRatio: [0.25, 0.1],
    sensoryTotal: [12, 4],
    avgSentenceLength: [30, 9],
    conflictInterpersonal: [0.3, 0.1],
    conflictInternal: [0.35, 0.12],
  },
  mixed: {
    type: "mixed",
    hookStrength: [3.5, 0.7],
    eventDensity: [4, 1.2],
    reversalsRange: [1, 3],
    threeAct: { setup: [0.33, 0.08], confrontation: [0.5, 0.08], resolution: [0.17, 0.05] },
    emotionMax: [3, 1.1],
    emotionMin: [-3, 1.1],
    dialogueRatio: [0.35, 0.13],
    sensoryTotal: [8, 3],
    avgSentenceLength: [23, 7],
    conflictInterpersonal: [0.45, 0.12],
    conflictInternal: [0.4, 0.12],
  },
};

const HOOK_TYPES = ["suspense", "action", "character", "atmosphere", "dialogue", "mixed"] as const;
const ENDING_TYPES = ["twist", "open", "circular", "tragic", "happy", "ambiguous"] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function buildEmotionCurve(rng: () => number, min: number, max: number) {
  const n = 5 + Math.floor(rng() * 4); // 5-8 点
  const labels = ["平静", "警觉", "震动", "怀疑", "恐惧", "决意", "颠覆", "释然", "失落"];
  const points: { position: number; emotion: number; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // 在 min..max 之间做正弦+扰动
    const base = (max + min) / 2 + ((max - min) / 2) * Math.sin(t * Math.PI * 1.5);
    points.push({
      position: Number(t.toFixed(3)),
      emotion: Number(clamp(base + (rng() - 0.5), min - 0.5, max + 0.5).toFixed(1)),
      label: pick(rng, labels),
    });
  }
  return points;
}

function buildReversals(rng: () => number, count: number) {
  const types = ["plot", "cognition", "emotion"] as const;
  const descs = [
    "主角发现关键线索",
    "看似 allies 的人物反水",
    "真相与预期相反",
    "时间线错位揭露",
    "主角认知崩塌",
  ];
  const out: { position: number; type: (typeof types)[number]; description: string }[] = [];
  for (let i = 0; i < count; i++) {
    // 反转分布在 25%-95% 之间
    const pos = 0.25 + (i / Math.max(count, 1)) * 0.7 + (rng() - 0.5) * 0.05;
    out.push({
      position: Number(clamp(pos, 0.1, 0.98).toFixed(3)),
      type: pick(rng, types),
      description: pick(rng, descs),
    });
  }
  return out.sort((a, b) => a.position - b.position);
}

export function generateSyntheticSeed(
  type: NovelTypeValue,
  index: number
): { id: string; teardown: TeardownResult } {
  const profile = PROFILES[type];
  const rng = makeRng(20240701 + index * 7919);

  const hookStrength = Number(jitter(rng, ...profile.hookStrength).toFixed(1));
  const eventDensity = Number(jitter(rng, ...profile.eventDensity).toFixed(1));
  const reversalsCount = Math.max(
    0,
    Math.round(profile.reversalsRange[0] + rng() * (profile.reversalsRange[1] - profile.reversalsRange[0]))
  );
  const setup = Number(clamp(jitter(rng, ...profile.threeAct.setup), 0.1, 0.6).toFixed(3));
  const resolution = Number(clamp(jitter(rng, ...profile.threeAct.resolution), 0.05, 0.35).toFixed(3));
  const confrontation = Number((1 - setup - resolution).toFixed(3));
  const emotionMax = Number(jitter(rng, ...profile.emotionMax).toFixed(1));
  const emotionMin = Number(jitter(rng, ...profile.emotionMin).toFixed(1));
  const dialogueRatio = Number(clamp(jitter(rng, ...profile.dialogueRatio), 0.05, 0.7).toFixed(3));
  const narrationRatio = Number((1 - dialogueRatio).toFixed(3));
  const sensoryTotal = jitter(rng, ...profile.sensoryTotal);
  const avgLen = Math.round(jitter(rng, ...profile.avgSentenceLength));
  const conflictInter = Number(clamp(jitter(rng, ...profile.conflictInterpersonal), 0, 1).toFixed(3));
  const conflictInternal = Number(clamp(jitter(rng, ...profile.conflictInternal), 0, 1 - conflictInter).toFixed(3));
  const conflictEnv = Number((1 - conflictInter - conflictInternal).toFixed(3));

  // 感官分配：visual 主导，其余按比例分
  const visual = Number((sensoryTotal * (0.4 + rng() * 0.2)).toFixed(1));
  const auditory = Number((sensoryTotal * (0.15 + rng() * 0.15)).toFixed(1));
  const tactile = Number((sensoryTotal * (0.1 + rng() * 0.1)).toFixed(1));
  const olfactory = Number((sensoryTotal * (0.05 + rng() * 0.08)).toFixed(1));
  const gustatory = Number((sensoryTotal * (0.03 + rng() * 0.05)).toFixed(1));

  const emotionCurve = buildEmotionCurve(rng, emotionMin, emotionMax);

  const wordCount = 500 + Math.floor(rng() * 1500);
  const paragraphCount = Math.max(5, Math.round(wordCount / 80));

  const teardown: TeardownResult = {
    type,
    typeConfidence: Number((0.75 + rng() * 0.2).toFixed(2)),
    wordCount,
    paragraphCount,
    skeleton: {
      hookType: pick(rng, HOOK_TYPES),
      hookStrength,
      hookEvidence: "合成种子（无原文证据）",
      hookAnalysis: `合成 ${type} 钩子分析，强度 ${hookStrength}`,
      threeActRatio: { setup, confrontation, resolution },
      reversals: buildReversals(rng, reversalsCount),
      endingType: pick(rng, ENDING_TYPES),
      endingAnalysis: "合成结局分析",
      eventDensity,
      eventDensityEvidence: `合成事件密度 ${eventDensity}/千字`,
    },
    flesh: {
      emotionCurve,
      emotionRange: { min: emotionMin, max: emotionMax },
      emotionTrend: "合成情绪走势",
      dialogueRatio,
      narrationRatio,
      dialogueAnalysis: "合成对话分析",
      sensoryFrequency: {
        visual,
        auditory,
        tactile,
        olfactory,
        gustatory,
      },
      sensoryAnalysis: "合成感官分析",
      characterArc: {
        desire: "主角的核心欲望",
        obstacle: "外部阻碍",
        change: "主角的转变",
        changePoint: Number(clamp(0.4 + rng() * 0.3, 0.2, 0.85).toFixed(3)),
      },
      conflictLayers: {
        interpersonal: conflictInter,
        internal: conflictInternal,
        environmental: conflictEnv,
        dominantConflict: "合成主导冲突",
      },
    },
    style: {
      sentenceStyle: {
        avgLength: avgLen,
        shortSentenceRatio: Number(clamp(0.4 + rng() * 0.25, 0.2, 0.7).toFixed(3)),
        longSentenceRatio: Number(clamp(0.08 + rng() * 0.1, 0.03, 0.25).toFixed(3)),
        rhythm: "合成句式节奏",
      },
      wordPreference: {
        formality: rng() > 0.5 ? "neutral" : "formal",
        imagery: rng() > 0.5 ? "concrete" : "abstract",
        keyword: ["信封", "雨夜", "回声"].slice(0, 2 + Math.floor(rng() * 2)),
      },
      perspective: "first",
      perspectiveAnalysis: "合成视角分析",
      tense: "past",
      tenseAnalysis: "合成时态分析",
    },
    summary: `合成 ${type} 种子 #${index}：用于基准库 bootstrap`,
    keyFindings: ["合成发现 1", "合成发现 2"],
  };

  return { id: `synthetic-${type}-${String(index).padStart(3, "0")}`, teardown };
}

/**
 * 按类型配比生成 N 篇合成种子
 * 配比：plot 35% / emotion 25% / atmosphere 25% / mixed 15%
 */
export function generateSyntheticSeeds(total: number): { id: string; teardown: TeardownResult }[] {
  const allocation: Record<NovelTypeValue, number> = {
    "plot-driven": Math.round(total * 0.35),
    "emotion-driven": Math.round(total * 0.25),
    "atmosphere-driven": Math.round(total * 0.25),
    mixed: total - Math.round(total * 0.35) - Math.round(total * 0.25) - Math.round(total * 0.25),
  };

  const seeds: { id: string; teardown: TeardownResult }[] = [];
  let idx = 0;
  (Object.entries(allocation) as [NovelTypeValue, number][]).forEach(([type, count]) => {
    for (let i = 0; i < count; i++) {
      seeds.push(generateSyntheticSeed(type, idx++));
    }
  });
  return seeds;
}
