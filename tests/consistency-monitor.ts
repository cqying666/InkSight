import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { teardownNovel } from "../src/lib/teardown";
import type { TeardownResult } from "../src/lib/teardown/schema";

/**
 * P1-T6 一致性监控脚本
 *
 * 对每篇测试文章多次拆解，计算核心维度的稳定性指标
 *
 * 用法:
 *   npx tsx tests/consistency-monitor.ts              # 默认: 5篇 × 3次
 *   npx tsx tests/consistency-monitor.ts 5 5          # 完整: 5篇 × 5次
 *   npx tsx tests/consistency-monitor.ts 3 2          # 快速: 3篇 × 2次
 *
 * 建议用 OpenCode Zen 免费模型跑测，避免费用:
 *   在 .env.local 中设置:
 *     LLM_API_KEY=your-zen-key
 *     LLM_BASE_URL=https://opencode.ai/zen/v1
 *     LLM_MODEL=deepseek-v4-flash-free
 *
 * 验收标准（PRD 6.1）: 核心维度一致性 >85%
 */

const FIXTURES_DIR = join(__dirname, "fixtures");
const OUTPUT_PATH = join(__dirname, "consistency-report.json");

// ===== 核心维度定义（PRD 6.1 要求监控的维度）=====

interface MetricDef {
  path: string;
  label: string;
  type: "number" | "enum";
  /** 提取函数 */
  extract: (t: TeardownResult) => number | string;
}

const CORE_METRICS: MetricDef[] = [
  {
    path: "type",
    label: "小说类型",
    type: "enum",
    extract: (t) => t.type,
  },
  {
    path: "skeleton.hookType",
    label: "钩子类型",
    type: "enum",
    extract: (t) => t.skeleton.hookType,
  },
  {
    path: "skeleton.hookStrength",
    label: "钩子强度",
    type: "number",
    extract: (t) => t.skeleton.hookStrength,
  },
  {
    path: "skeleton.endingType",
    label: "结局类型",
    type: "enum",
    extract: (t) => t.skeleton.endingType,
  },
  {
    path: "skeleton.reversals_count",
    label: "反转数量",
    type: "number",
    extract: (t) => t.skeleton.reversals.length,
  },
  {
    path: "skeleton.eventDensity",
    label: "事件密度",
    type: "number",
    extract: (t) => t.skeleton.eventDensity,
  },
  {
    path: "flesh.dialogueRatio",
    label: "对话占比",
    type: "number",
    extract: (t) => t.flesh.dialogueRatio,
  },
  {
    path: "flesh.emotion_range_max",
    label: "情绪高峰",
    type: "number",
    extract: (t) => t.flesh.emotionRange.max,
  },
  {
    path: "flesh.emotion_range_min",
    label: "情绪低谷",
    type: "number",
    extract: (t) => t.flesh.emotionRange.min,
  },
  {
    path: "style.perspective",
    label: "叙事视角",
    type: "enum",
    extract: (t) => t.style.perspective,
  },
  {
    path: "style.tense",
    label: "叙事时态",
    type: "enum",
    extract: (t) => t.style.tense,
  },
];

// ===== 一致性计算 =====

interface MetricResult {
  path: string;
  label: string;
  type: "number" | "enum";
  /** 数值型: 变异系数 CV = std/mean；枚举型: 一致率 = 最大频率/总次数 */
  consistency: number;
  /** 一致性百分比 0-100% */
  consistencyPct: number;
  /** 各次运行的值 */
  values: (number | string)[];
  /** 数值型额外信息 */
  mean?: number;
  std?: number;
  /** 枚举型额外信息 */
  mode?: string;
  modeCount?: number;
}

/**
 * 计算数值型维度的一致性
 * 用 1 - CV（变异系数）作为一致性指标
 * CV = std / |mean|，CV 越小一致性越高
 */
function calcNumberConsistency(values: number[]): MetricResult["consistency"] & {
  mean?: number;
  std?: number;
} {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  // 如果均值接近 0，用绝对标准差判断
  if (Math.abs(mean) < 0.01) {
    return std < 0.5 ? 1 : Math.max(0, 1 - std);
  }

  const cv = std / Math.abs(mean);
  return { consistency: Math.max(0, 1 - cv), mean, std };
}

/**
 * 计算枚举型维度的一致性
 * 一致率 = 出现最多的值的次数 / 总次数
 */
function calcEnumConsistency(values: string[]): {
  consistency: number;
  mode: string;
  modeCount: number;
} {
  if (values.length === 0) return { consistency: 0, mode: "", modeCount: 0 };
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let mode = "";
  let modeCount = 0;
  for (const [v, c] of counts) {
    if (c > modeCount) {
      mode = v;
      modeCount = c;
    }
  }
  return { consistency: modeCount / values.length, mode, modeCount };
}

// ===== 主流程 =====

interface ArticleResult {
  file: string;
  runs: TeardownResult[];
  metrics: MetricResult[];
  /** 该文章的平均一致性 */
  avgConsistency: number;
  errors: string[];
}

async function runConsistencyTest(
  fixtureFiles: string[],
  runsPerArticle: number
): Promise<{ results: ArticleResult[]; totalMs: number; totalTokens: number }> {
  const results: ArticleResult[] = [];
  let totalMs = 0;
  let totalTokens = 0;
  const startTime = Date.now();

  for (let fi = 0; fi < fixtureFiles.length; fi++) {
    const file = fixtureFiles[fi];
    console.log(
      `\n[${fi + 1}/${fixtureFiles.length}] 测试文章: ${file} (${runsPerArticle} 次)`
    );

    const text = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    const runs: TeardownResult[] = [];
    const errors: string[] = [];

    for (let r = 1; r <= runsPerArticle; r++) {
      process.stdout.write(`  第 ${r}/${runsPerArticle} 次拆解...`);
      try {
        const result = await teardownNovel(text);
        runs.push(result.data);
        totalMs += result.durationMs;
        totalTokens += result.tokens;
        console.log(
          ` ✅ ${result.durationMs}ms, ${result.tokens} tokens`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`第${r}次: ${msg}`);
        console.log(` ❌ ${msg.slice(0, 80)}`);
      }
    }

    if (runs.length === 0) {
      results.push({
        file,
        runs: [],
        metrics: [],
        avgConsistency: 0,
        errors,
      });
      continue;
    }

    // 计算每个核心维度的一致性
    const metrics: MetricResult[] = CORE_METRICS.map((m) => {
      const values = runs.map((r) => m.extract(r));

      if (m.type === "number") {
        const numValues = values as number[];
        const calc = calcNumberConsistency(numValues);
        return {
          path: m.path,
          label: m.label,
          type: m.type,
          consistency: calc.consistency,
          consistencyPct: Math.round(calc.consistency * 100),
          values: numValues.map((v) => Number(v.toFixed(3))),
          mean: calc.mean ? Number(calc.mean.toFixed(3)) : undefined,
          std: calc.std ? Number(calc.std.toFixed(3)) : undefined,
        };
      } else {
        const strValues = values as string[];
        const calc = calcEnumConsistency(strValues);
        return {
          path: m.path,
          label: m.label,
          type: m.type,
          consistency: calc.consistency,
          consistencyPct: Math.round(calc.consistency * 100),
          values: strValues,
          mode: calc.mode,
          modeCount: calc.modeCount,
        };
      }
    });

    const avgConsistency =
      metrics.reduce((sum, m) => sum + m.consistency, 0) / metrics.length;

    results.push({
      file,
      runs,
      metrics,
      avgConsistency: Number(avgConsistency.toFixed(3)),
      errors,
    });

    console.log(`  → 平均一致性: ${(avgConsistency * 100).toFixed(1)}%`);
  }

  return {
    results,
    totalMs: Date.now() - startTime,
    totalTokens,
  };
}

// ===== 报告生成 =====

function generateReport(
  results: ArticleResult[],
  totalMs: number,
  totalTokens: number,
  runsPerArticle: number
): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════╗");
  lines.push("║          InkSight 一致性监控报告 (P1-T6)                 ║");
  lines.push("╚══════════════════════════════════════════════════════════╝\n");

  // 总览
  const validResults = results.filter((r) => r.metrics.length > 0);
  const overallAvg =
    validResults.reduce((s, r) => s + r.avgConsistency, 0) /
    (validResults.length || 1);
  const passed = overallAvg >= 0.85;

  lines.push(`📊 总览`);
  lines.push(`   文章数: ${results.length}`);
  lines.push(`   每篇次数: ${runsPerArticle}`);
  lines.push(`   总耗时: ${(totalMs / 1000).toFixed(1)}s`);
  lines.push(`   总 Tokens: ${totalTokens}`);
  lines.push(
    `   总体一致性: ${(overallAvg * 100).toFixed(1)}% ${
      passed ? "✅ 通过" : "❌ 未达标"
    }`
  );
  lines.push(`   验收标准: >85%\n`);

  // 各文章详情
  for (const r of results) {
    lines.push(`━`.repeat(60));
    lines.push(`📄 ${r.file}`);
    if (r.errors.length > 0) {
      lines.push(`   ⚠️  错误: ${r.errors.length} 次`);
      r.errors.forEach((e) => lines.push(`      - ${e.slice(0, 100)}`));
    }
    if (r.metrics.length === 0) continue;

    lines.push(`   平均一致性: ${(r.avgConsistency * 100).toFixed(1)}%\n`);
    lines.push(
      `   ${"维度".padEnd(16)} ${"类型".padEnd(6)} ${"一致性".padEnd(
        8
      )} 值`
    );
    lines.push(`   ${"─".repeat(56)}`);

    for (const m of r.metrics) {
      const valuesStr =
        m.type === "number"
          ? `mean=${m.mean}, std=${m.std}, [${m.values.join(", ")}]`
          : `mode=${m.mode} (${m.modeCount}/${m.values.length}), [${m.values.join(", ")}]`;

      const status = m.consistencyPct >= 85 ? "✅" : m.consistencyPct >= 70 ? "⚠️" : "❌";
      lines.push(
        `   ${m.label.padEnd(14)} ${m.type.padEnd(4)} ${status} ${String(
          m.consistencyPct
        ).padStart(3)}%   ${valuesStr}`
      );
    }
    lines.push("");
  }

  // 按维度汇总（跨文章）
  lines.push("━".repeat(60));
  lines.push("📈 跨文章维度汇总\n");

  const metricSummary = new Map<
    string,
    { label: string; type: string; consistencies: number[] }
  >();

  for (const r of validResults) {
    for (const m of r.metrics) {
      if (!metricSummary.has(m.path)) {
        metricSummary.set(m.path, {
          label: m.label,
          type: m.type,
          consistencies: [],
        });
      }
      metricSummary.get(m.path)!.consistencies.push(m.consistency);
    }
  }

  lines.push(
    `   ${"维度".padEnd(16)} ${"平均一致性".padEnd(12)} ${"最低".padEnd(
      8
    )} ${"最高".padEnd(8)} 状态`
  );
  lines.push(`   ${"─".repeat(56)}`);

  for (const [path, summary] of metricSummary) {
    const avg =
      summary.consistencies.reduce((a, b) => a + b, 0) /
      summary.consistencies.length;
    const min = Math.min(...summary.consistencies);
    const max = Math.max(...summary.consistencies);
    const status = avg >= 0.85 ? "✅ 通过" : avg >= 0.7 ? "⚠️ 边缘" : "❌ 不达标";
    lines.push(
      `   ${summary.label.padEnd(14)} ${(avg * 100).toFixed(1).padStart(
        6
      )}%      ${(min * 100).toFixed(0).padStart(3)}%    ${(max * 100).toFixed(
        0
      ).padStart(3)}%    ${status}`
    );
  }

  lines.push("\n" + "═".repeat(60));
  lines.push(
    `结论: 总体一致性 ${(overallAvg * 100).toFixed(1)}% — ${
      passed ? "✅ 达到 85% 验收标准" : "❌ 未达 85% 验收标准，需优化 prompt"
    }`
  );

  return lines.join("\n");
}

// ===== 入口 =====

async function main() {
  const args = process.argv.slice(2);
  const articleCount = parseInt(args[0] || "5", 10);
  const runsPerArticle = parseInt(args[1] || "3", 10);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║          InkSight 一致性监控 (P1-T6)                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n配置: ${articleCount} 篇文章 × ${runsPerArticle} 次 = ${
    articleCount * runsPerArticle
  } 次调用`);

  // 检查 API Key
  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("\n❌ LLM_API_KEY 未配置");
    console.error("   请在 .env.local 中填入 API Key");
    console.error("\n   💡 省钱提示: 用 OpenCode Zen 免费模型跑测试:");
    console.error("      LLM_API_KEY=your-zen-key");
    console.error("      LLM_BASE_URL=https://opencode.ai/zen/v1");
    console.error("      LLM_MODEL=deepseek-v4-flash-free");
    process.exit(1);
  }

  // 显示当前 LLM 配置
  const model = process.env.LLM_MODEL || "deepseek-chat";
  const baseUrl = process.env.LLM_BASE_URL || "https://api.deepseek.com";
  const isZen = baseUrl.includes("opencode.ai/zen");
  console.log(`\n当前 LLM 配置:`);
  console.log(`   模型: ${model} ${isZen ? "(OpenCode Zen 免费)" : ""}`);
  console.log(`   端点: ${baseUrl}`);
  if (isZen) {
    console.log(`   💡 使用免费模型，不产生费用`);
  } else {
    console.log(`   ⚠️  使用付费模型，将产生费用`);
  }

  // 加载测试文章
  const allFiles = [
    "test-1-suspense.txt",
    "test-2-romance.txt",
    "test-3-atmosphere.txt",
    "test-4-action.txt",
    "test-5-mixed.txt",
  ].filter((f) => existsSync(join(FIXTURES_DIR, f)));

  const fixtureFiles = allFiles.slice(0, articleCount);
  if (fixtureFiles.length === 0) {
    console.error("\n❌ 未找到测试文章");
    process.exit(1);
  }

  console.log(`\n开始测试...\n`);

  // 执行测试
  const { results, totalMs, totalTokens } = await runConsistencyTest(
    fixtureFiles,
    runsPerArticle
  );

  // 生成报告
  const report = generateReport(results, totalMs, totalTokens, runsPerArticle);
  console.log("\n" + report);

  // 保存 JSON 报告
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: { articleCount, runsPerArticle, model, baseUrl },
        summary: {
          totalMs,
          totalTokens,
          overallConsistency:
            results.filter((r) => r.metrics.length > 0).reduce(
              (s, r) => s + r.avgConsistency,
              0
            ) / (results.filter((r) => r.metrics.length > 0).length || 1),
        },
        results,
      },
      null,
      2
    )
  );
  console.log(`\n💾 JSON 报告已保存: ${OUTPUT_PATH}`);

  // 退出码
  const validResults = results.filter((r) => r.metrics.length > 0);
  const overallAvg =
    validResults.reduce((s, r) => s + r.avgConsistency, 0) /
    (validResults.length || 1);
  process.exit(overallAvg >= 0.85 ? 0 : 1);
}

main().catch((err) => {
  console.error("测试运行失败:", err);
  process.exit(1);
});
