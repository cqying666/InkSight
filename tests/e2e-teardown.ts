import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { teardownNovel, detectNovelType, validateTeardown } from "../src/lib/teardown";

/**
 * Phase 0 端到端测试
 * 用法: npx tsx tests/e2e-teardown.ts
 *
 * 验证 5 篇测试文章的拆解管线
 * - JSON 输出格式 100% 通过 schema 校验
 * - 类型识别准确率 >= 60%
 * - 每个维度的 evidence 字段非空
 */

const FIXTURES_DIR = join(__dirname, "fixtures");

interface TestResult {
  file: string;
  expectedType: string;
  actualType?: string;
  typeConfidence?: number;
  schemaValid: boolean;
  schemaErrors?: string[];
  durationMs?: number;
  tokens?: number;
  error?: string;
}

async function runTest(
  file: string,
  expectedType: string
): Promise<TestResult> {
  const text = readFileSync(join(FIXTURES_DIR, file), "utf-8");
  const result: TestResult = { file, expectedType, schemaValid: false };

  try {
    // Step 1: 类型识别
    const typeResult = await detectNovelType(text);
    result.actualType = typeResult.type;
    result.typeConfidence = typeResult.confidence;

    // Step 2: 拆解
    const teardown = await teardownNovel(text);
    result.durationMs = teardown.durationMs;
    result.tokens = teardown.tokens;

    // Step 3: Schema 校验
    const validation = validateTeardown(teardown.data);
    result.schemaValid = validation.success;
    if (!validation.success) {
      result.schemaErrors = validation.errors;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

async function main() {
  console.log("\n===== InkSight Phase 0 端到端测试 =====\n");

  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("错误: LLM_API_KEY 未配置");
    console.error("请复制 .env.example 为 .env.local 并填入 DeepSeek API Key");
    process.exit(1);
  }

  const testCases = [
    { file: "test-1-suspense.txt", expectedType: "plot-driven" },
    { file: "test-2-romance.txt", expectedType: "emotion-driven" },
    { file: "test-3-atmosphere.txt", expectedType: "atmosphere-driven" },
    { file: "test-4-action.txt", expectedType: "plot-driven" },
    { file: "test-5-mixed.txt", expectedType: "mixed" },
  ];

  const results: TestResult[] = [];

  for (const tc of testCases) {
    console.log(`测试中: ${tc.file} (期望类型: ${tc.expectedType})...`);
    const result = await runTest(tc.file, tc.expectedType);
    results.push(result);

    if (result.error) {
      console.log(`  ❌ 失败: ${result.error}\n`);
    } else {
      const typeMatch = result.actualType === tc.expectedType;
      console.log(
        `  ${result.schemaValid ? "✅" : "❌"} Schema: ${result.schemaValid ? "通过" : "失败"}`
      );
      console.log(
        `  ${typeMatch ? "✅" : "⚠️"} 类型: ${result.actualType} (期望 ${tc.expectedType}, 置信度 ${result.typeConfidence?.toFixed(2)})`
      );
      console.log(
        `  ⏱️  耗时: ${result.durationMs}ms | Tokens: ${result.tokens}\n`
      );
    }
  }

  // 汇总
  console.log("\n===== 测试汇总 =====\n");
  const passed = results.filter((r) => r.schemaValid).length;
  const typeCorrect = results.filter(
    (r) => r.actualType === r.expectedType
  ).length;

  console.log(`Schema 校验: ${passed}/${results.length} 通过`);
  console.log(`类型识别: ${typeCorrect}/${results.length} 正确`);
  console.log(
    `总耗时: ${results.reduce((sum, r) => sum + (r.durationMs || 0), 0)}ms`
  );
  console.log(
    `总 Tokens: ${results.reduce((sum, r) => sum + (r.tokens || 0), 0)}`
  );

  if (results.some((r) => r.schemaErrors)) {
    console.log("\n--- Schema 错误详情 ---");
    for (const r of results) {
      if (r.schemaErrors) {
        console.log(`\n${r.file}:`);
        r.schemaErrors.forEach((e) => console.log(`  - ${e}`));
      }
    }
  }

  // 验收
  const schemaPass = passed === results.length;
  const typePass = typeCorrect >= 3; // >= 60%

  console.log("\n===== 验收标准 =====\n");
  console.log(`${schemaPass ? "✅" : "❌"} JSON 输出格式 100% 通过 schema 校验`);
  console.log(`${typePass ? "✅" : "❌"} 类型识别准确率 >= 60%`);

  process.exit(schemaPass && typePass ? 0 : 1);
}

main().catch((err) => {
  console.error("测试运行失败:", err);
  process.exit(1);
});
