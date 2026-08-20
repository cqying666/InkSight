import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "inksight-pi-models-"));
  const originalCwd = process.cwd();
  process.chdir(tempRoot);

  try {
    const { closeDb } = await import("../src/lib/db/index.ts");
    const { createModel } = await import("../src/lib/ai/models.ts");
    const { createPiModelRuntime } = await import("../src/lib/pi/runtime.ts");

    const config = createModel({
      name: "测试 Pi 模型",
      provider: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-chat",
      contextWindow: 65_536,
      maxTokens: 12_288,
      supportsReasoning: true,
      isActive: true,
    }, false);
    const runtime = createPiModelRuntime(config);
    const resolved = await runtime.models.getAuth(runtime.model);

    assert.equal(runtime.model.api, "openai-completions");
    assert.equal(runtime.model.contextWindow, 65_536);
    assert.equal(runtime.model.maxTokens, 12_288);
    assert.equal(runtime.model.reasoning, true);
    assert.equal(resolved?.auth.apiKey, "test-key");
    assert.equal(resolved?.auth.baseUrl, undefined);

    closeDb();
    console.log("pi model management contract passed");
  } finally {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

void main();
