import type { TeardownResult, NovelTypeValue } from "../teardown/schema";
import type { MaterialOriginValue } from "./schema";
import {
  type Material,
  type ComponentContentValue,
  type ComponentKindValue,
} from "./schema";
import { trackEvent } from "../report/analytics";

/**
 * 拆文自动提取素材管线 (P4-T10)
 *
 * 规则版（首个迭代）：
 *  - 从 TeardownResult 的 14 维度 JSON 直接映射生成 5 类组件素材
 *  - 准确率目标 >80%（PRD §5.6 + 工程约束 §2）
 *  - 后续迭代可用 LLM 优化 summary / excerpt 文案质量
 *
 * 5 类提取（PRD §5.6 拆文自动提取表）：
 *  1. hook          开头钩子写法   ← skeleton.hookType + hookStrength + hookEvidence + hookAnalysis
 *  2. reversal      反转节奏模式   ← skeleton.reversals[]
 *  3. emotion_curve 情绪曲线形状   ← flesh.emotionCurve[] + emotionRange + emotionTrend
 *  4. character_arc 人物弧光路径   ← flesh.characterArc
 *  5. conflict      冲突层次配置   ← flesh.conflictLayers
 *
 * 每条素材：
 *  - layer = "component"
 *  - source = "teardown"
 *  - origin = { title, type, reportId }
 *  - component.details = 结构化字段
 *  - component.summary = 一句话摘要
 *  - component.excerpt = 原文摘录（钩子类有 evidence，其他类无原文摘录）
 */

// ===== 钩子类型中文名 =====

const HOOK_TYPE_LABEL: Record<string, string> = {
  suspense: "悬念型",
  action: "动作型",
  character: "人物型",
  atmosphere: "氛围型",
  dialogue: "对话型",
  mixed: "混合型",
};

const REVERSAL_TYPE_LABEL: Record<string, string> = {
  plot: "情节反转",
  cognition: "认知反转",
  emotion: "情感反转",
};

// ===== ID 生成（稳定 id：reportId + kind） =====

function genMaterialId(reportId: string, kind: string): string {
  // 使用稳定 ID：同一拆文报告 + 同一类组件始终生成同一 id，避免重复提取时产生重复条目
  const safeReportId = reportId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `mat-${safeReportId}-${kind}`;
}

// ===== 5 类提取器 =====

/**
 * 1. 开头钩子写法
 */
function extractHook(
  td: TeardownResult,
  origin: MaterialOriginValue,
  reportId: string
): Material {
  const sk = td.skeleton;
  const hookLabel = HOOK_TYPE_LABEL[sk.hookType] || sk.hookType;
  const summary = `${hookLabel}钩子 ${sk.hookStrength}/5：${sk.hookAnalysis.slice(0, 60)}`;

  const content: ComponentContentValue = {
    kind: "hook",
    summary,
    details: {
      hookType: sk.hookType,
      hookTypeLabel: hookLabel,
      hookStrength: sk.hookStrength,
      hookAnalysis: sk.hookAnalysis,
    },
    excerpt: sk.hookEvidence,
    tags: ["开头钩子", hookLabel],
  };

  return buildMaterial(reportId, "hook", content, origin);
}

/**
 * 2. 反转节奏模式
 */
function extractReversal(
  td: TeardownResult,
  origin: MaterialOriginValue,
  reportId: string
): Material | null {
  const reversals = td.skeleton.reversals;
  if (reversals.length === 0) return null;

  const parts = reversals.map(
    (r) =>
      `${(r.position * 100).toFixed(0)}%(${REVERSAL_TYPE_LABEL[r.type] || r.type})`
  );
  const summary =
    reversals.length === 1
      ? `单反转结构：${parts[0]}`
      : `${reversals.length}重反转：${parts.join(" → ")}`;

  const content: ComponentContentValue = {
    kind: "reversal",
    summary,
    details: {
      count: reversals.length,
      reversals: reversals.map((r) => ({
        position: r.position,
        positionPct: Number((r.position * 100).toFixed(0)),
        type: r.type,
        typeLabel: REVERSAL_TYPE_LABEL[r.type] || r.type,
        description: r.description,
      })),
      intervals:
        reversals.length > 1
          ? reversals.slice(1).map((r, i) => ({
              from: reversals[i].position,
              to: r.position,
              gap: Number((r.position - reversals[i].position).toFixed(2)),
            }))
          : [],
    },
    tags: ["反转节奏", `${reversals.length}重反转`],
  };

  return buildMaterial(reportId, "reversal", content, origin);
}

/**
 * 3. 情绪曲线形状
 */
function extractEmotionCurve(
  td: TeardownResult,
  origin: MaterialOriginValue,
  reportId: string
): Material {
  const fl = td.flesh;
  const points = fl.emotionCurve;
  const range = fl.emotionRange;

  // 判断曲线形状
  const shape = detectEmotionShape(points.map((p) => p.emotion));
  const summary = `${shape}：前 40% 持续 ${points[0]?.emotion ?? 0}，峰值 ${range.max}，谷值 ${range.min}`;

  const content: ComponentContentValue = {
    kind: "emotion_curve",
    summary,
    details: {
      shape,
      range: { min: range.min, max: range.max },
      points: points.map((p) => ({
        position: p.position,
        positionPct: Number((p.position * 100).toFixed(0)),
        emotion: p.emotion,
        label: p.label,
      })),
      trend: fl.emotionTrend,
    },
    tags: ["情绪曲线", shape],
  };

  return buildMaterial(reportId, "emotion_curve", content, origin);
}

/**
 * 4. 人物弧光路径
 */
function extractCharacterArc(
  td: TeardownResult,
  origin: MaterialOriginValue,
  reportId: string
): Material {
  const arc = td.flesh.characterArc;
  const changePct = (arc.changePoint * 100).toFixed(0);
  const summary = `${arc.desire.slice(0, 20)}→${arc.change.slice(0, 20)}（变化节点在 ${changePct}% 位置）`;

  const content: ComponentContentValue = {
    kind: "character_arc",
    summary,
    details: {
      desire: arc.desire,
      obstacle: arc.obstacle,
      change: arc.change,
      changePoint: arc.changePoint,
      changePointPct: Number(changePct),
    },
    tags: ["人物弧光"],
  };

  return buildMaterial(reportId, "character_arc", content, origin);
}

/**
 * 5. 冲突层次配置
 */
function extractConflict(
  td: TeardownResult,
  origin: MaterialOriginValue,
  reportId: string
): Material {
  const cl = td.flesh.conflictLayers;
  const dominantPct = (cl.interpersonal * 100).toFixed(0);
  const summary = `以${cl.dominantConflict}为主（${dominantPct}%）`;

  const content: ComponentContentValue = {
    kind: "conflict",
    summary,
    details: {
      interpersonal: cl.interpersonal,
      internal: cl.internal,
      environmental: cl.environmental,
      dominantConflict: cl.dominantConflict,
      distribution: {
        人际: cl.interpersonal,
        内心: cl.internal,
        环境: cl.environmental,
      },
    },
    tags: ["冲突层次"],
  };

  return buildMaterial(reportId, "conflict", content, origin);
}

// ===== 辅助函数 =====

/**
 * 检测情绪曲线形状
 */
function detectEmotionShape(emotions: number[]): string {
  if (emotions.length < 3) return "简短曲线";
  const first = emotions[0];
  const last = emotions[emotions.length - 1];
  const max = Math.max(...emotions);
  const min = Math.min(...emotions);
  const maxIdx = emotions.indexOf(max);
  const minIdx = emotions.indexOf(min);

  // 先抑后扬：前段低位，后段高位
  if (first < 0 && last > 0 && minIdx < maxIdx) return "先抑后扬型";
  // 先扬后抑
  if (first > 0 && last < 0 && maxIdx < minIdx) return "先扬后抑型";
  // 持续高位
  if (min > 2) return "持续高昂型";
  // 持续低位
  if (max < -2) return "持续压抑型";
  // V 型：谷在中间
  if (minIdx > 0 && minIdx < emotions.length - 1 && max > 2) return "V型反转";
  // 倒 V：峰在中间
  if (maxIdx > 0 && maxIdx < emotions.length - 1 && min < -2) return "倒V型";
  // 波动
  if (max - min > 4) return "剧烈波动型";
  return "平稳曲线";
}

/**
 * 组装 Material 条目
 */
function buildMaterial(
  reportId: string,
  kind: ComponentKindValue,
  content: ComponentContentValue,
  origin: MaterialOriginValue
): Material {
  const now = new Date().toISOString();
  return {
    id: genMaterialId(reportId, kind),
    layer: "component",
    source: "teardown",
    origin,
    createdAt: now,
    updatedAt: now,
    userId: "anonymous", // P4-T14 个人收藏接入后替换为真实 userId
    favorited: false,
    component: content,
  };
}

// ===== 主入口 =====

export interface ExtractOptions {
  /** 拆文报告 ID（用于 origin.reportId 回溯） */
  reportId: string;
  /** 来源作品标题（用户上传文件名） */
  title?: string;
  /** 来源作品类型 */
  type?: NovelTypeValue;
  /** 是否触发埋点（默认 true） */
  track?: boolean;
}

/**
 * 从拆文结果提取 5 类组件素材
 *
 * @param td 拆文结果
 * @param opts 提取选项
 * @returns 提取出的素材数组（5 类，可能少 1 类如果无反转）
 */
export function extractMaterialsFromTeardown(
  td: TeardownResult,
  opts: ExtractOptions
): Material[] {
  const origin: MaterialOriginValue = {
    title: opts.title,
    type: opts.type ?? (td.type as NovelTypeValue),
    reportId: opts.reportId,
  };

  const materials: Material[] = [
    extractHook(td, origin, opts.reportId),
    extractReversal(td, origin, opts.reportId),
    extractEmotionCurve(td, origin, opts.reportId),
    extractCharacterArc(td, origin, opts.reportId),
    extractConflict(td, origin, opts.reportId),
  ].filter((m): m is Material => m !== null);

  if (opts.track !== false) {
    trackEvent("material_auto_extracted", {
      report_id: opts.reportId,
      extract_count: materials.length,
      kinds: materials.map((m) => m.component?.kind),
      type: td.type,
    });
  }

  return materials;
}

/**
 * 校验提取出的素材是否合规（layer/source/origin 一致性）
 */
export function validateExtractedMaterials(materials: Material[]): {
  valid: Material[];
  invalid: { material: Material; errors: string[] }[];
} {
  // 局部导入避免循环依赖
  const { validateMaterial } = require("./schema");
  const valid: Material[] = [];
  const invalid: { material: Material; errors: string[] }[] = [];

  for (const m of materials) {
    const r = validateMaterial(m);
    if (r.success && r.data) {
      valid.push(r.data);
    } else {
      invalid.push({ material: m, errors: r.errors || ["未知错误"] });
    }
  }

  return { valid, invalid };
}
