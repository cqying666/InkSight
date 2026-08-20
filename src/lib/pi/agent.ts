import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  Message,
  Model,
  MutableModels,
} from "@earendil-works/pi-ai";
import { getActiveModel, getModelById, type AIModelConfig } from "@/lib/ai/models";
import { createPiModelRuntime } from "./runtime";

export interface PiAgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunPiAgentOptions {
  systemPrompt: string;
  messages: PiAgentChatMessage[];
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  sessionId?: string;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onEvent?: (event: AgentEvent) => void;
}

export interface PiAgentRunResult {
  content: string;
  model: string;
  truncated: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface PiAgentExecutionRuntime {
  models: MutableModels;
  model: Model<any>;
  modelName: string;
  supportsReasoning: boolean;
}

function resolveModelConfig(modelId?: string): AIModelConfig {
  const config = modelId
    ? getModelById(modelId, false) ?? getActiveModel(false)
    : getActiveModel(false);
  if (!config?.apiKey) {
    throw new Error("AI 教练未配置，请在 AI 管理页添加并激活一个 Pi 模型");
  }
  return config;
}

function toPiMessage(message: PiAgentChatMessage): Message {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: "openai-completions",
      provider: "inksight-history",
      model: "inksight-history",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };
  }
  return {
    role: "user",
    content: [{ type: "text", text: message.content }],
    timestamp: Date.now(),
  };
}

function textFromAssistant(message: AssistantMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function lastAssistant(messages: AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") return message;
  }
  return undefined;
}

/**
 * InkSight 对 Pi Agent 的最小封装。
 *
 * 所有业务调用都经由此函数进入 Pi；模型 Provider/Model 从管理员配置动态构建，
 * 业务层仍可维持原有的 JSON、流式、超时与调用日志契约。
 */
export async function runPiAgent(options: RunPiAgentOptions): Promise<PiAgentRunResult> {
  const config = resolveModelConfig(options.modelId);
  const runtime = createPiModelRuntime(config);
  return runPiAgentWithRuntime(
    {
      models: runtime.models,
      model: runtime.model,
      modelName: config.model,
      supportsReasoning: config.supportsReasoning,
    },
    options
  );
}

/** Pi runtime 可注入版本：生产使用管理员配置，测试使用 Pi faux provider。 */
export async function runPiAgentWithRuntime(
  runtime: PiAgentExecutionRuntime,
  options: Omit<RunPiAgentOptions, "modelId">
): Promise<PiAgentRunResult> {
  if (options.signal?.aborted) {
    throw new Error("Pi Agent 请求已取消");
  }
  const history = options.messages.map(toPiMessage);
  const latest = history.pop();
  if (!latest || latest.role !== "user") {
    throw new Error("Pi Agent 需要以用户消息结束当前回合");
  }

  const requestModel: Model<any> = {
    ...runtime.model,
    maxTokens: Math.min(options.maxTokens ?? runtime.model.maxTokens, runtime.model.maxTokens),
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt,
      model: requestModel,
      messages: history,
      thinkingLevel: runtime.supportsReasoning ? "low" : "off",
    },
    sessionId: options.sessionId,
    streamFn: (activeModel, context, streamOptions) =>
      runtime.models.streamSimple(activeModel, context, {
        ...streamOptions,
        temperature: options.temperature,
        maxTokens: requestModel.maxTokens,
        timeoutMs: options.timeoutMs,
        maxRetries: 0,
        samplingParams: options.jsonMode
          ? {
              ...streamOptions?.samplingParams,
              response_format: { type: "json_object" },
            }
          : streamOptions?.samplingParams,
      }),
  });

  agent.subscribe((event) => {
    options.onEvent?.(event);
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      options.onTextDelta?.(event.assistantMessageEvent.delta);
    }
  });

  const abort = () => agent.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeoutId = options.timeoutMs
    ? setTimeout(() => agent.abort(), options.timeoutMs)
    : undefined;
  const startedAt = Date.now();

  try {
    await agent.prompt(latest);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abort);
  }

  const response = lastAssistant(agent.state.messages);
  if (!response) throw new Error("Pi Agent 未返回助手消息");
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || "Pi Agent 请求未完成");
  }

  const promptTokens = response.usage.input + response.usage.cacheRead + response.usage.cacheWrite;
  return {
    content: textFromAssistant(response),
    model: runtime.modelName,
    truncated: response.stopReason === "length",
    usage: {
      promptTokens,
      completionTokens: response.usage.output,
      totalTokens: response.usage.totalTokens,
    },
    durationMs: Date.now() - startedAt,
  };
}
