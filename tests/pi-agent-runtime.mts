import assert from "node:assert/strict";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { runPiAgentWithRuntime } from "../src/lib/pi/agent.ts";

async function main() {
  const faux = fauxProvider({
    provider: "inksight-test",
    models: [{ id: "faux-coach", name: "Faux Coach", contextWindow: 32_768, maxTokens: 2_048 }],
    tokensPerSecond: 10_000,
  });
  const models = createModels();
  models.setProvider(faux.provider);

  const deltas: string[] = [];
  faux.setResponses([
    (_context, options) => {
      assert.deepEqual(options?.samplingParams?.response_format, { type: "json_object" });
      return fauxAssistantMessage('{"status":"ok"}');
    },
  ]);
  const result = await runPiAgentWithRuntime(
    {
      models,
      model: faux.getModel(),
      modelName: "faux-coach",
      supportsReasoning: false,
    },
    {
      systemPrompt: "你是测试教练。",
      messages: [{ role: "user", content: "输出 JSON" }],
      jsonMode: true,
      onTextDelta: (delta) => deltas.push(delta),
    }
  );

  assert.equal(result.content, '{"status":"ok"}');
  assert.equal(result.model, "faux-coach");
  assert.equal(faux.state.callCount, 1);
  assert.equal(deltas.join(""), result.content);

  faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider failed" })]);
  await assert.rejects(
    () =>
      runPiAgentWithRuntime(
        {
          models,
          model: faux.getModel(),
          modelName: "faux-coach",
          supportsReasoning: false,
        },
        {
          systemPrompt: "你是测试教练。",
          messages: [{ role: "user", content: "失败" }],
        }
      ),
    /provider failed/
  );

  console.log("pi-agent runtime contract passed");
}

void main();
