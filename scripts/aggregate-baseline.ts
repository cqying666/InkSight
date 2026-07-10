import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { aggregateByType, type TypeAggregation } from "../src/lib/baseline/aggregator";
import type { TeardownResult, NovelTypeValue } from "../src/lib/teardown/schema";

/**
 * P3-T2 基准库聚合 CLI
 *
 * 用法:
 *   npx tsx scripts/aggregate-baseline.ts                  # 默认读 data/seed-corpus
 *   npx tsx scripts/aggregate-baseline.ts data/my-corpus   # 指定语料目录
 *
 * 输出: data/baseline.json —— 按类型聚合的 mean/std/分位数，供 baseline.ts 加载
 *
 * 真实 100 篇到位后重跑此脚本即可刷新基准，无需改代码。
 */

const DEFAULT_CORPUS = join(process.cwd(), "data/seed-corpus");
const OUTPUT_PATH = join(process.cwd(), "data/baseline.json");

function loadCorpus(dir: string): TeardownResult[] {
  if (!existsSync(dir)) {
    console.error(`语料目录不存在: ${dir}`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".json") && f !== "_index.json"
  );
  const out: TeardownResult[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      // 兼容 {data: {...}} 包装
      const td = raw.data ?? raw;
      if (td && td.type && td.skeleton) out.push(td as TeardownResult);
    } catch {
      console.warn(`跳过损坏文件: ${f}`);
    }
  }
  return out;
}

function main() {
  const corpusDir = process.argv[2] || DEFAULT_CORPUS;
  console.log("\n===== InkSight P3-T2 基准库聚合 =====\n");
  console.log(`语料目录: ${corpusDir}`);

  const corpus = loadCorpus(corpusDir);
  console.log(`已加载: ${corpus.length} 篇拆解结果`);

  if (corpus.length === 0) {
    console.error("无可用数据。先运行: npx tsx scripts/batch-teardown.ts --synthetic 40");
    process.exit(1);
  }

  const aggregations = aggregateByType(corpus);

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    totalSamples: corpus.length,
    byType: {} as Record<string, number>,
    aggregations: aggregations as unknown as Record<
      NovelTypeValue,
      TypeAggregation
    >,
  };

  for (const [type, agg] of Object.entries(aggregations)) {
    summary.byType[type] = agg.sampleSize;
  }

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n聚合完成:`);
  for (const [type, agg] of Object.entries(aggregations)) {
    console.log(
      `  ${type}: ${agg.sampleSize} 篇, ${Object.keys(agg.metrics).length} 维度`
    );
  }
  console.log(`\n输出: ${OUTPUT_PATH}`);
  console.log(`\n诊断引擎将自动加载此基准（baseline.ts 优先读 data/baseline.json）`);
}

main();
