import {
  createModels,
  createProvider,
  type ApiKeyAuth,
  type Model,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { AIModelConfig } from "@/lib/ai/models";

const ZERO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export interface PiModelRuntime {
  models: MutableModels;
  model: Model<"openai-completions">;
  providerId: string;
}

/**
 * 将 AI 管理页的一条配置映射为独立 Pi Provider。
 *
 * 配置不会写入 Pi 的 credential store；API Key 始终保留在 InkSight 自己的
 * SQLite 中，并在每次 Pi 请求时由 provider auth 解析。
 */
export function createPiModelRuntime(config: AIModelConfig): PiModelRuntime {
  const providerId = `inksight-${config.id}`;
  const auth: ApiKeyAuth = {
    name: `${config.name} API Key`,
    resolve: async ({ signal }) => {
      signal.throwIfAborted();
      const apiKey = config.apiKey.trim();
      if (!apiKey) return undefined;
      return {
        auth: { apiKey },
        source: "InkSight AI 管理",
      };
    },
  };

  const model: Model<"openai-completions"> = {
    id: config.model,
    name: config.name,
    api: "openai-completions",
    provider: providerId,
    baseUrl: config.baseURL,
    reasoning: config.supportsReasoning,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
  };

  const provider = createProvider({
    id: providerId,
    name: config.name,
    baseUrl: config.baseURL,
    auth: { apiKey: auth },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);

  return { models, model, providerId };
}
