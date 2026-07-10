import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { teardownNovel, detectNovelType, validateTeardown } from "../src/lib/teardown";
import type { TeardownResult, NovelTypeValue } from "../src/lib/teardown/schema";

/**
 * P3-T1 批量预拆管道
 *
 * 用途：把一个目录下的小说文本批量拆解，结果入库 data/seed-corpus/，
 *      供 P3-T2 基准库聚合使用。
 *
 * 用法:
 *   npx tsx scripts/batch-teardown.ts                    # 默认跑 tests/fixtures
 *   npx tsx scripts/batch-teardown.ts data/my-corpus     # 指定语料目录
 *   npx tsx scripts/batch-teardown.ts --skip-llm         # 跳过 LLM 调用，仅用合成种子（不烧额度）
 *   npx tsx scripts/batch-teardown.ts --synthetic 20     # 生成 20 篇合成种子（schema-valid，按类型参数化）
 *
 * 前置: .env.local 已配置 LLM_API_KEY（除非 --skip-llm / --synthetic）
 *
 * 输出: data/seed-corpus/<basename>.json  —— 每篇一个 TeardownResult
 *      data/seed-corpus/_index.json       —— 索引（file/type/source）
 */

const DEFAULT_FIXTURES_DIR = join(process.cwd(), "tests/fixtures");
const OUTPUT_DIR = join(process.cwd(), "data/seed-corpus");

interface SeedEntry {
  file: string;
  type: NovelTypeValue;
  source: "real" | "synthetic";
  schemaValid: boolean;
  durationMs?: number;
  error?: string;
}

async function runOne(
  filePath: string,
  source: "real" | "synthetic" = "real"
): Promise<{ result: TeardownResult | null; entry: SeedEntry; raw?: string }> {
  const basename = filePath.split("/").pop()!.replace(/\.\w+$/, "");
  const text = readFileSync(filePath, "utf-8");
  const entry: SeedEntry = {
    file: basename,
    type: "mixed",
    source,
    schemaValid: false,
  };

  try {
    const typeRes = await detectNovelType(text);
    entry.type = typeRes.type;
    const td = await teardownNovel(text);
    entry.durationMs = td.durationMs;
    const validation = validateTeardown(td.data);
    entry.schemaValid = validation.success;
    if (!validation.success) {
      entry.error = `schema: ${validation.errors?.join("; ")}`;
    }
    return { result: td.data, entry };
  } catch (e) {
    entry.error = e instanceof Error ? e.message : String(e);
    return { result: null, entry };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // 模式解析
  const skipLlm = args.includes("--skip-llm");
  const syntheticIdx = args.indexOf("--synthetic");
  const syntheticCount =
    syntheticIdx >= 0 ? Number(args[syntheticIdx + 1] || "20") : 0;
  const corpusDirArg = args.find((a) => !a.startsWith("--"));

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("\n===== InkSight P3-T1 批量预拆管道 =====\n");

  // ===== 模式 1: 合成种子 =====
  if (syntheticCount > 0) {
    console.log(`生成 ${syntheticCount} 篇合成种子（schema-valid，按类型参数化）…`);
    const { generateSyntheticSeeds } = await import("./synthetic-seeds");
    const seeds = generateSyntheticSeeds(syntheticCount);
    const entries: SeedEntry[] = [];
    for (const seed of seeds) {
      const fname = `${seed.id}.json`;
      writeFileSync(
        join(OUTPUT_DIR, fname),
        JSON.stringify(seed.teardown, null, 2),
        "utf-8"
      );
      entries.push({
        file: seed.id,
        type: seed.teardown.type as NovelTypeValue,
        source: "synthetic",
        schemaValid: true,
      });
      console.log(`  ✓ ${seed.id} [${seed.teardown.type}]`);
    }
    writeIndex(entries);
    summarize(entries);
    return;
  }

  // ===== 模式 2: 真实语料批量拆解 =====
  if (skipLlm) {
    console.log("--skip-llm：跳过 LLM 调用，仅使用已有 data/seed-corpus 中数据");
    const existing = existsSync(OUTPUT_DIR)
      ? readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json") && f !== "_index.json")
      : [];
    console.log(`已有种子文件: ${existing.length}`);
    if (existing.length === 0) {
      console.log("提示：用 --synthetic 20 生成合成种子启动基准库");
    }
    return;
  }

  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("错误: LLM_API_KEY 未配置。");
    console.error("  选项: 在 .env.local 填入 LLM_API_KEY，或用 --synthetic 20 生成合成种子");
    process.exit(1);
  }

  const corpusDir = corpusDirArg || DEFAULT_FIXTURES_DIR;
  if (!existsSync(corpusDir)) {
    console.error(`语料目录不存在: ${corpusDir}`);
    process.exit(1);
  }

  const files = readdirSync(corpusDir).filter((f) => /\.txt$/.test(f));
  console.log(`语料目录: ${corpusDir}`);
  console.log(`待拆解文件: ${files.length} 篇\n`);

  const entries: SeedEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`[${i + 1}/${files.length}] ${f} …`);
    const { result, entry } = await runOne(join(corpusDir, f), "real");
    entries.push(entry);
    if (result) {
      const outName = f.replace(/\.\w+$/, ".json");
      writeFileSync(
        join(OUTPUT_DIR, outName),
        JSON.stringify(result, null, 2),
        "utf-8"
      );
      console.log(
        `  ✓ [${entry.type}] schema=${entry.schemaValid ? "✓" : "✗"} ${entry.durationMs}ms`
      );
    } else {
      console.log(`  ✗ ${entry.error}`);
    }
  }

  writeIndex(entries);
  summarize(entries);
}

function writeIndex(entries: SeedEntry[]) {
  writeFileSync(
    join(OUTPUT_DIR, "_index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2),
    "utf-8"
  );
}

function summarize(entries: SeedEntry[]) {
  console.log("\n===== 汇总 =====\n");
  const ok = entries.filter((e) => e.schemaValid).length;
  const byType: Record<string, number> = {};
  for (const e of entries) byType[e.type] = (byType[e.type] || 0) + 1;
  console.log(`成功: ${ok}/${entries.length}`);
  console.log(`类型分布: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log(`\n下一步: npx tsx scripts/aggregate-baseline.ts 聚合基准库`);
}

main().catch((err) => {
  console.error("批量预拆失败:", err);
  process.exit(1);
});
