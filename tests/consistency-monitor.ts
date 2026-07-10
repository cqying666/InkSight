import { readFileSync, writeFileSync, existsSync } from "fs";
import { execFileSync, spawnSync } from "child_process";
import { join } from "path";
import { z } from "zod";
import {
  TeardownSchema,
  TYPE_WEIGHT_TEMPLATES,
} from "../src/lib/teardown/schema";
import type { TeardownResult, NovelTypeValue } from "../src/lib/teardown/schema";
import {
  TYPE_DETECTION_PROMPT,
  TEARDOWN_PROMPT,
} from "../src/lib/teardown/prompts";

/**
 * P1-T6 一致性监控脚本（OpenCode CLI 版）
 *
 * 使用 `opencode run` 调用免费模型，避免 DeepSeek 费用
 *
 * 用法:
 *   npx tsx tests/consistency-monitor.ts           # 默认 5篇 × 2次
 *   npx tsx tests/consistency-monitor.ts 5 3       # 5篇 × 3次
 *   npx tsx tests/consistency-monitor.ts 3 1       # 快速 3篇 × 1次
 *
 * 前置:
 *   brew install anomalyco/tap/opencode
 *
 * 验收标准（PRD 6.1）: 核心维度一致性 >85%
 */

const FIXTURES_DIR = join(__dirname, "fixtures");
const OUTPUT_PATH = join(__dirname, "consistency-report.json");
const SUMMARY_PATH = join(__dirname, "consistency-report.md");
// 默认 mimo-v2.5-free：实测 ~21 tokens/s，2K tokens 拆解输出 ~100s，在 240s 超时内
// deepseek-v4-flash-free 对中等输出(>500 tokens)会挂起，不可用
const MODEL = process.env.OPENCODE_MODEL || "opencode/mimo-v2.5-free";

// ===== OpenCode CLI 调用封装 =====

interface OpenCodeResult {
  text: string;
  tokens: number;
  durationMs: number;
}

/**
 * 调用 opencode run，解析 JSON 事件流，返回最终文本输出
 *
 * 用 spawnSync 避免 execFileSync 的 maxBuffer 限制和继承的 sandbox 问题
 * prompt 通过 stdin 传入，避免命令行参数过长导致 shell 解析截断
 * 免费模型延迟波动大/偶发挂起，采用重试机制（单次 240s 超时，最多 2 次）
 */
const PER_ATTEMPT_TIMEOUT = 240_000; // 单次 240s（拆解需生成 ~2K tokens，免费模型较慢）
const MAX_ATTEMPTS = 2;

function callOpenCodeOnce(
  fullPrompt: string
): { text: string; tokens: number; durationMs: number; error?: string } {
  const start = Date.now();
  // --variant 可选（默认不传，因免费模型对 minimal 变体支持不稳定）
  const VARIANT = process.env.OPENCODE_VARIANT || "";
  // --pure 禁用所有 agent 工具（含文件写入），强制纯文本补全模式
  // 不加 --pure 时模型会用工具把 JSON 写到文件，text 事件只返回摘要
  const args = ["run", "--pure", "-m", MODEL, "--format", "json"];
  if (VARIANT) {
    args.push("--variant", VARIANT);
  }
  // prompt 作为位置参数传入（opencode run [message..] 不读 stdin）
  // spawnSync 未启用 shell，args 直接传给 execve，无 shell 转义截断风险
  // prompt ~22K 字符远低于 macOS ARG_MAX(~1MB)，安全
  args.push(fullPrompt);

  const result = spawnSync(
    "opencode",
    args,
    {
      encoding: "utf-8",
      timeout: PER_ATTEMPT_TIMEOUT,
      cwd: process.cwd(),
      // XDG_STATE_HOME 重定向到可写目录，避免 TRAE sandbox 阻止写 lock 文件导致挂起
      env: {
        ...process.env,
        NO_COLOR: "1",
        XDG_STATE_HOME: process.env.OPENCODE_STATE_HOME || "/tmp/opencode-state",
      },
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const durationMs = Date.now() - start;

  if (result.error) {
    return { text: "", tokens: 0, durationMs, error: `spawn失败: ${result.error.message.slice(0, 150)}` };
  }

  const rawOutput = result.stdout || "";

  // 解析 JSON 事件流（每行一个 JSON 对象）
  const lines = rawOutput
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));

  let text = "";
  let tokens = 0;
  const errorEvents: string[] = [];

  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "text" && evt.part?.text) {
        text += evt.part.text;
      } else if (evt.type === "step_finish" && evt.part?.tokens) {
        tokens += evt.part.tokens.total || 0;
      } else if (evt.type === "error" || evt.type === "step_error" || evt.error) {
        errorEvents.push(JSON.stringify(evt).slice(0, 300));
      }
    } catch {
      // 忽略无法解析的行
    }
  }

  if (text) {
    return { text, tokens, durationMs };
  }

  // 没拿到文本，收集诊断信息
  const diag: string[] = [];
  if (errorEvents.length > 0) diag.push(`错误事件: ${errorEvents.join(" | ")}`);
  if (result.stderr) diag.push(`stderr尾部: ${result.stderr.slice(-200)}`);
  diag.push(`stdout尾部: ${rawOutput.slice(-300)}`);
  return { text: "", tokens: 0, durationMs, error: diag.join(" || ") };
}

function callOpenCode(systemPrompt: string, userPrompt: string): OpenCodeResult {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  let totalDuration = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      process.stdout.write(`(重试 ${attempt}/${MAX_ATTEMPTS})`);
    }
    const r = callOpenCodeOnce(fullPrompt);
    totalDuration += r.durationMs;
    if (r.text) {
      return { text: r.text, tokens: r.tokens, durationMs: totalDuration };
    }
    lastError = r.error || "未知错误";
    // ETIMEDOUT 属于挂起，值得重试；其他错误也重试（免费模型偶发失败）
  }

  throw new Error(`opencode ${MAX_ATTEMPTS} 次重试后仍失败: ${lastError}`);
}

// ===== 拆解逻辑（与 src/lib/teardown 一致，但走 opencode）=====

/**
 * 归一化小说类型：LLM 可能输出中文/近义词，统一映射到 NovelTypeValue
 */
function normalizeNovelType(raw: string): NovelTypeValue {
  const s = String(raw).trim().toLowerCase();
  if (s.includes("plot") || s.includes("情节驱动")) return "plot-driven";
  if (s.includes("emotion") || s.includes("情感驱动")) return "emotion-driven";
  if (s.includes("atmosphere") || s.includes("氛围驱动")) return "atmosphere-driven";
  return "mixed";
}

async function teardownWithOpenCode(
  novelText: string
): Promise<{ data: TeardownResult; durationMs: number; tokens: number }> {
  // Step 1: 类型识别
  process.stdout.write("[类型识别]");
  const typeResult = callOpenCode(
    TYPE_DETECTION_PROMPT.system,
    TYPE_DETECTION_PROMPT.user(novelText)
  );
  process.stdout.write(`✓(${typeResult.durationMs / 1000 | 0}s)[拆解]`);

  let typeData: { type: string; confidence: number; reasoning: string };
  try {
    const cleaned = extractJson(typeResult.text);
    typeData = JSON.parse(cleaned);
  } catch {
    throw new Error(`类型识别 JSON 解析失败: ${typeResult.text.slice(0, 200)}`);
  }

  const detectedType = normalizeNovelType(typeData.type);
  const novelType: NovelTypeValue =
    Number(typeData.confidence) < 0.7 ? "mixed" : detectedType;
  const weights = TYPE_WEIGHT_TEMPLATES[novelType];

  // Step 2: 拆解
  const teardownResult = callOpenCode(
    TEARDOWN_PROMPT.system(novelType, weights),
    TEARDOWN_PROMPT.user(novelText)
  );

  let teardownRaw: unknown;
  try {
    const cleaned = extractJson(teardownResult.text);
    teardownRaw = JSON.parse(cleaned);
  } catch {
    throw new Error(`拆解 JSON 解析失败: ${teardownResult.text.slice(0, 200)}`);
  }

  // Schema 校验（容错模式）
  const parseResult = TeardownSchema.safeParse(teardownRaw);
  if (!parseResult.success) {
    // 保存原始输出便于调试
    const debugPath = join(__dirname, "debug-raw-teardown.json");
    writeFileSync(debugPath, JSON.stringify(teardownRaw, null, 2));
    const errs = parseResult.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Schema 校验失败: ${errs}（原始输出已存 ${debugPath}）`);
  }

  return {
    data: parseResult.data,
    durationMs: typeResult.durationMs + teardownResult.durationMs,
    tokens: typeResult.tokens + teardownResult.tokens,
  };
}

/**
 * 从文本中提取 JSON（去掉 markdown 代码块包装）
 */
function extractJson(text: string): string {
  let t = text.trim();

  // 去掉 markdown 代码块
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  // 找第一个 { 和最后一个 }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1);
  }

  return t.trim();
}

// ===== 核心维度定义 =====

interface MetricDef {
  path: string;
  label: string;
  type: "number" | "enum";
  extract: (t: TeardownResult) => number | string;
}

const CORE_METRICS: MetricDef[] = [
  { path: "type", label: "小说类型", type: "enum", extract: (t) => t.type },
  { path: "skeleton.hookType", label: "钩子类型", type: "enum", extract: (t) => t.skeleton.hookType },
  { path: "skeleton.hookStrength", label: "钩子强度", type: "number", extract: (t) => t.skeleton.hookStrength },
  { path: "skeleton.endingType", label: "结局类型", type: "enum", extract: (t) => t.skeleton.endingType },
  { path: "skeleton.reversals_count", label: "反转数量", type: "number", extract: (t) => t.skeleton.reversals.length },
  { path: "skeleton.eventDensity", label: "事件密度", type: "number", extract: (t) => t.skeleton.eventDensity },
  { path: "flesh.dialogueRatio", label: "对话占比", type: "number", extract: (t) => t.flesh.dialogueRatio },
  { path: "flesh.emotion_range_max", label: "情绪高峰", type: "number", extract: (t) => t.flesh.emotionRange.max },
  { path: "flesh.emotion_range_min", label: "情绪低谷", type: "number", extract: (t) => t.flesh.emotionRange.min },
  { path: "style.perspective", label: "叙事视角", type: "enum", extract: (t) => t.style.perspective },
  { path: "style.tense", label: "叙事时态", type: "enum", extract: (t) => t.style.tense },
];

// ===== 一致性计算 =====

interface MetricResult {
  path: string;
  label: string;
  type: "number" | "enum";
  consistency: number;
  consistencyPct: number;
  values: (number | string)[];
  mean?: number;
  std?: number;
  mode?: string;
  modeCount?: number;
}

function calcNumberConsistency(values: number[]) {
  if (values.length < 2) return { consistency: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (Math.abs(mean) < 0.01) return { consistency: std < 0.5 ? 1 : Math.max(0, 1 - std), mean, std };
  const cv = std / Math.abs(mean);
  return { consistency: Math.max(0, 1 - cv), mean, std };
}

function calcEnumConsistency(values: string[]) {
  if (values.length === 0) return { consistency: 0, mode: "", modeCount: 0 };
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let mode = "", modeCount = 0;
  for (const [v, c] of counts) if (c > modeCount) { mode = v; modeCount = c; }
  return { consistency: modeCount / values.length, mode, modeCount };
}

// ===== 主流程 =====

interface ArticleResult {
  file: string;
  runs: TeardownResult[];
  metrics: MetricResult[];
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
    console.log(`\n[${fi + 1}/${fixtureFiles.length}] 测试文章: ${file} (${runsPerArticle} 次)`);

    const text = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    const runs: TeardownResult[] = [];
    const errors: string[] = [];

    for (let r = 1; r <= runsPerArticle; r++) {
      process.stdout.write(`  第 ${r}/${runsPerArticle} 次拆解...`);
      try {
        const result = await teardownWithOpenCode(text);
        runs.push(result.data);
        totalMs += result.durationMs;
        totalTokens += result.tokens;
        console.log(` ✅ ${(result.durationMs / 1000).toFixed(1)}s, ${result.tokens} tokens`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`第${r}次: ${msg}`);
        console.log(` ❌ ${msg.slice(0, 100)}`);
      }
    }

    if (runs.length === 0) {
      results.push({ file, runs: [], metrics: [], avgConsistency: 0, errors });
      continue;
    }

    const metrics: MetricResult[] = CORE_METRICS.map((m) => {
      const values = runs.map((r) => m.extract(r));
      if (m.type === "number") {
        const numValues = values as number[];
        const calc = calcNumberConsistency(numValues);
        return {
          path: m.path, label: m.label, type: m.type,
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
          path: m.path, label: m.label, type: m.type,
          consistency: calc.consistency,
          consistencyPct: Math.round(calc.consistency * 100),
          values: strValues, mode: calc.mode, modeCount: calc.modeCount,
        };
      }
    });

    const avgConsistency = metrics.reduce((s, m) => s + m.consistency, 0) / metrics.length;
    results.push({ file, runs, metrics, avgConsistency: Number(avgConsistency.toFixed(3)), errors });
    console.log(`  → 平均一致性: ${(avgConsistency * 100).toFixed(1)}%`);
  }

  return { results, totalMs: Date.now() - startTime, totalTokens };
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
  lines.push("║     InkSight 一致性监控报告 (P1-T6 · OpenCode CLI)       ║");
  lines.push("╚══════════════════════════════════════════════════════════╝\n");

  const validResults = results.filter((r) => r.metrics.length > 0);
  const overallAvg = validResults.reduce((s, r) => s + r.avgConsistency, 0) / (validResults.length || 1);
  const passed = overallAvg >= 0.85;

  lines.push(`📊 总览`);
  lines.push(`   模型: ${MODEL}`);
  lines.push(`   文章数: ${results.length}  ×  每篇次数: ${runsPerArticle}`);
  lines.push(`   总耗时: ${(totalMs / 1000).toFixed(1)}s`);
  lines.push(`   总 Tokens: ${totalTokens}  (费用: $0 — 免费模型)`);
  lines.push(`   总体一致性: ${(overallAvg * 100).toFixed(1)}% ${passed ? "✅ 通过" : "❌ 未达标"}`);
  lines.push(`   验收标准: >85%\n`);

  for (const r of results) {
    lines.push(`━`.repeat(60));
    lines.push(`📄 ${r.file}`);
    if (r.errors.length > 0) {
      lines.push(`   ⚠️  错误: ${r.errors.length} 次`);
      r.errors.forEach((e) => lines.push(`      - ${e.slice(0, 100)}`));
    }
    if (r.metrics.length === 0) continue;

    lines.push(`   平均一致性: ${(r.avgConsistency * 100).toFixed(1)}%\n`);
    lines.push(`   ${"维度".padEnd(14)} ${"类型".padEnd(6)} ${"一致性".padEnd(8)} 值`);
    lines.push(`   ${"─".repeat(56)}`);

    for (const m of r.metrics) {
      const valuesStr = m.type === "number"
        ? `mean=${m.mean}, std=${m.std}, [${m.values.join(", ")}]`
        : `mode=${m.mode} (${m.modeCount}/${m.values.length}), [${m.values.join(", ")}]`;
      const status = m.consistencyPct >= 85 ? "✅" : m.consistencyPct >= 70 ? "⚠️" : "❌";
      lines.push(`   ${m.label.padEnd(12)} ${m.type.padEnd(4)} ${status} ${String(m.consistencyPct).padStart(3)}%   ${valuesStr}`);
    }
    lines.push("");
  }

  lines.push("━".repeat(60));
  lines.push("📈 跨文章维度汇总\n");

  const metricSummary = new Map<string, { label: string; type: string; consistencies: number[] }>();
  for (const r of validResults) {
    for (const m of r.metrics) {
      if (!metricSummary.has(m.path)) {
        metricSummary.set(m.path, { label: m.label, type: m.type, consistencies: [] });
      }
      metricSummary.get(m.path)!.consistencies.push(m.consistency);
    }
  }

  lines.push(`   ${"维度".padEnd(14)} ${"平均".padEnd(10)} ${"最低".padEnd(8)} ${"最高".padEnd(8)} 状态`);
  lines.push(`   ${"─".repeat(56)}`);

  for (const [, summary] of metricSummary) {
    const avg = summary.consistencies.reduce((a, b) => a + b, 0) / summary.consistencies.length;
    const min = Math.min(...summary.consistencies);
    const max = Math.max(...summary.consistencies);
    const status = avg >= 0.85 ? "✅ 通过" : avg >= 0.7 ? "⚠️ 边缘" : "❌ 不达标";
    lines.push(`   ${summary.label.padEnd(12)} ${(avg * 100).toFixed(1).padStart(6)}%   ${(min * 100).toFixed(0).padStart(3)}%    ${(max * 100).toFixed(0).padStart(3)}%    ${status}`);
  }

  lines.push("\n" + "═".repeat(60));
  lines.push(`结论: 总体一致性 ${(overallAvg * 100).toFixed(1)}% — ${passed ? "✅ 达到 85% 验收标准" : "❌ 未达 85% 验收标准，需优化 prompt"}`);

  return lines.join("\n");
}

// ===== 入口 =====

async function main() {
  const args = process.argv.slice(2);
  const articleCount = parseInt(args[0] || "5", 10);
  const runsPerArticle = parseInt(args[1] || "2", 10);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║     InkSight 一致性监控 (P1-T6 · OpenCode CLI)          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n配置: ${articleCount} 篇文章 × ${runsPerArticle} 次 = ${articleCount * runsPerArticle} 次调用`);
  console.log(`模型: ${MODEL} (免费)`);

  // 验证 opencode 可用
  try {
    execFileSync("opencode", ["--version"], { encoding: "utf-8", stdio: "pipe" });
  } catch {
    console.error("\n❌ opencode 未安装或不可用");
    console.error("   安装: brew install anomalyco/tap/opencode");
    process.exit(1);
  }

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

  console.log(`\n开始测试（全程免费）...\n`);

  const { results, totalMs, totalTokens } = await runConsistencyTest(fixtureFiles, runsPerArticle);

  const report = generateReport(results, totalMs, totalTokens, runsPerArticle);
  console.log("\n" + report);

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      config: { articleCount, runsPerArticle, model: MODEL },
      summary: {
        totalMs,
        totalTokens,
        cost: 0,
        overallConsistency: results.filter((r) => r.metrics.length > 0).reduce((s, r) => s + r.avgConsistency, 0) / (results.filter((r) => r.metrics.length > 0).length || 1),
      },
      results,
    }, null, 2)
  );
  console.log(`\n💾 JSON 报告已保存: ${OUTPUT_PATH}`);

  // 文本摘要归档（markdown），便于 PR / 提交记录引用
  const md = `# InkSight 一致性监控报告\n\n> 生成时间: ${new Date().toISOString()}\n> 模型: ${MODEL} · 文章: ${fixtureFiles.length} × ${runsPerArticle} 次\n\n\`\`\`\n${report}\n\`\`\`\n`;
  writeFileSync(SUMMARY_PATH, md, "utf-8");
  console.log(`📄 文本摘要已保存: ${SUMMARY_PATH}`);

  const validResults = results.filter((r) => r.metrics.length > 0);
  const overallAvg = validResults.reduce((s, r) => s + r.avgConsistency, 0) / (validResults.length || 1);
  process.exit(overallAvg >= 0.85 ? 0 : 1);
}

main().catch((err) => {
  console.error("测试运行失败:", err);
  process.exit(1);
});
