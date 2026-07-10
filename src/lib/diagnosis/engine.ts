import type { TeardownResult, NovelTypeValue } from "../teardown/schema";
import { getBaseline, type MetricBaseline } from "./baseline";
import { extractMetrics } from "../baseline/aggregator";

/**
 * 诊断规则引擎 (P1-T2)
 *
 * 拆解结果 vs 同类型基准，识别：
 * - 2-3 个结构薄弱点（weakness）
 * - 1-2 个提升机会（opportunity）
 *
 * 每个 finding 附带：用户值、基准值、偏差、严重程度
 */

export type FindingSeverity = "critical" | "moderate" | "minor";

export interface DiagnosisFinding {
  /** 维度路径 */
  metricPath: string;
  /** 维度中文名 */
  label: string;
  /** 用户实际值 */
  userValue: number;
  /** 同类型基准均值 */
  baselineMean: number;
  /** z-score（偏离程度，负数=低于基准） */
  zScore: number;
  /** 偏差百分比 */
  deviationPct: number;
  /** 严重程度 */
  severity: FindingSeverity;
  /** 方向描述：用户偏低 / 用户偏高 */
  direction: "below" | "above";
  /** 一句话诊断 */
  diagnosis: string;
}

export interface DiagnosisResult {
  type: NovelTypeValue;
  /** 薄弱点（2-3 个） */
  weaknesses: DiagnosisFinding[];
  /** 提升机会（1-2 个） */
  opportunities: DiagnosisFinding[];
}

// ===== 严重程度判定 =====

function getSeverity(zScore: number, direction: "below" | "above"): FindingSeverity {
  const abs = Math.abs(zScore);
  // direction=below 且 z<-1.5 = critical（关键薄弱）
  // direction=above 且 z>1.5 = critical（过度）
  if (abs >= 1.5) return "critical";
  if (abs >= 1.0) return "moderate";
  return "minor";
}

// ===== 诊断描述生成 =====

function buildDiagnosis(
  label: string,
  userValue: number,
  baselineMean: number,
  direction: "below" | "above",
  metricDirection: "higher" | "lower" | "neutral"
): string {
  const fmt = (v: number) =>
    Number.isInteger(v) ? String(v) : v.toFixed(2);

  if (direction === "below") {
    if (metricDirection === "higher") {
      return `${label}为 ${fmt(userValue)}，低于同类基准 ${fmt(baselineMean)}，建议提升`;
    }
    if (metricDirection === "lower") {
      return `${label}为 ${fmt(userValue)}，低于同类基准 ${fmt(baselineMean)}（此维度偏低反而更好，无需调整）`;
    }
    return `${label}为 ${fmt(userValue)}，偏离同类基准 ${fmt(baselineMean)}`;
  }

  // direction === "above"
  if (metricDirection === "higher") {
    return `${label}为 ${fmt(userValue)}，高于同类基准 ${fmt(baselineMean)}（表现优异，可继续保持）`;
  }
  if (metricDirection === "lower") {
    return `${label}为 ${fmt(userValue)}，高于同类基准 ${fmt(baselineMean)}，建议控制`;
  }
  return `${label}为 ${fmt(userValue)}，偏离同类基准 ${fmt(baselineMean)}`;
}

// ===== 主诊断函数 =====

export function diagnose(
  teardown: TeardownResult,
  type: NovelTypeValue
): DiagnosisResult {
  const baseline = getBaseline(type);
  const metrics = extractMetrics(teardown);

  const findings: DiagnosisFinding[] = [];

  for (const m of metrics) {
    const b: MetricBaseline | undefined = baseline.metrics[m.path];
    if (!b) continue;

    const zScore = (m.value - b.mean) / (b.std || 1);
    const direction: "below" | "above" = zScore < 0 ? "below" : "above";
    const severity = getSeverity(zScore, direction);
    const deviationPct =
      b.mean !== 0 ? ((m.value - b.mean) / Math.abs(b.mean)) * 100 : 0;

    // 只记录有意义的偏离（|z| >= 0.8）
    if (Math.abs(zScore) < 0.8) continue;

    findings.push({
      metricPath: m.path,
      label: b.label,
      userValue: m.value,
      baselineMean: b.mean,
      zScore: Number(zScore.toFixed(2)),
      deviationPct: Number(deviationPct.toFixed(1)),
      severity,
      direction,
      diagnosis: buildDiagnosis(
        b.label,
        m.value,
        b.mean,
        direction,
        b.direction
      ),
    });
  }

  // 分类：薄弱点 vs 提升机会
  // 薄弱点 = direction=below 且 metricDirection=higher（应该高却低）
  //       或 direction=above 且 metricDirection=lower（应该低却高）
  // 提升机会 = direction=above 且 metricDirection=higher（应该高且更高，优势）
  const weaknesses: DiagnosisFinding[] = [];
  const opportunities: DiagnosisFinding[] = [];

  for (const f of findings) {
    const b = baseline.metrics[f.metricPath];
    if (!b) continue;

    const isWeakness =
      (f.direction === "below" && b.direction === "higher") ||
      (f.direction === "above" && b.direction === "lower");

    const isOpportunity =
      f.direction === "above" && b.direction === "higher";

    if (isWeakness) {
      weaknesses.push(f);
    } else if (isOpportunity) {
      opportunities.push(f);
    }
  }

  // 排序：薄弱点按严重程度（z-score 绝对值降序）
  weaknesses.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  opportunities.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  // 限制数量：薄弱点 2-3 个，提升机会 1-2 个
  return {
    type,
    weaknesses: weaknesses.slice(0, 3),
    opportunities: opportunities.slice(0, 2),
  };
}
