import OpenAI from "openai";

/**
 * LLM 服务接入层
 * 默认使用 DeepSeek（OpenAI 兼容接口），通过 openai SDK 直接复用
 * 支持超时、重试、JSON 模式
 *
 * DeepSeek 文档: https://api-docs.deepseek.com/
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY 未配置。请复制 .env.example 为 .env.local 并填入 DeepSeek API Key。"
    );
  }

  client = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    timeout: 300_000, // 300 秒超时（拆文/人设提示词复杂，JSON 输出耗时较长）
    // SDK 层不重试：callLLMWithSchema 已有 maxAttempts=2 的 schema 错误重试
    // 避免 SDK 重试 × schema 重试叠加导致最坏 4 次调用
    maxRetries: 0,
  });

  return client;
}

export function getModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

export interface LLMCallOptions {
  systemPrompt: string;
  userPrompt: string;
  /** 是否使用 JSON 模式（结构化输出） */
  jsonMode?: boolean;
  /** 温度，默认 0.3（拆解需稳定，处方可稍高） */
  temperature?: number;
  /** 超时毫秒，默认 300000 */
  timeout?: number;
  /** 最大输出 token 数，默认 8192（拆文/人设 JSON 较大，需放开） */
  maxTokens?: number;
}

export interface LLMCallResult {
  content: string;
  /** 解析后的 JSON（若 jsonMode 为 true） */
  parsed?: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 耗时毫秒 */
  durationMs: number;
}

/**
 * 统一 LLM 调用接口
 * - 支持 JSON 模式（response_format: json_object）
 * - 支持超时与重试
 * - 自动解析 JSON 输出
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  const {
    systemPrompt,
    userPrompt,
    jsonMode = false,
    temperature = 0.3,
    timeout = 300_000,
    maxTokens = 8192,
  } = options;

  const openai = getClient();
  const model = getModel();
  const startTime = Date.now();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode
      ? { response_format: { type: "json_object" } }
      : {}),
  });

  const durationMs = Date.now() - startTime;
  const content = response.choices[0]?.message?.content || "";

  let parsed: unknown;
  if (jsonMode) {
    try {
      parsed = JSON.parse(content);
    } catch {
      // JSON 解析失败，返回原始内容，由调用方处理
    }
  }

  return {
    content,
    parsed,
    usage: {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    },
    durationMs,
  };
}

/**
 * 调用 LLM 并校验 JSON 输出
 * 失败时抛出错误，由调用方降级处理
 *
 * validate 支持两种返回格式：
 * - Zod 原生: { success: false, error: ZodError }
 * - 自定义:   { success: false, errors: string[] }
 */
export async function callLLMWithSchema<T>(
  options: LLMCallOptions & {
    validate: (data: unknown) => {
      success: boolean;
      data?: T;
      errors?: string[];
      error?: { issues?: Array<{ path: (string | number)[]; message: string }> };
    };
    /** 最大重试次数（含首次），默认 2 */
    maxAttempts?: number;
  }
): Promise<{ data: T; raw: LLMCallResult }> {
  const { validate, maxAttempts = 2, ...llmOptions } = options;

  // 把 validate 的返回归一化为 string[] 错误
  const extractErrors = (
    result: Awaited<ReturnType<typeof validate>>
  ): string[] => {
    if (result.errors && result.errors.length > 0) return result.errors;
    if (result.error?.issues?.length) {
      return result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
      );
    }
    return ["未知校验错误"];
  };

  let lastError = "";
  let lastRawContent = "";
  const originalUserPrompt = llmOptions.userPrompt;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let currentPrompt = originalUserPrompt;
      if (attempt > 1 && lastError) {
        currentPrompt += `\n\n上一次输出存在以下问题，请严格修正后重新输出完整 JSON：\n${lastError}`;
      }

      const raw = await callLLM({ ...llmOptions, userPrompt: currentPrompt, jsonMode: true });
      lastRawContent = raw.content;

      if (!raw.parsed) {
        lastError = `LLM 输出不是有效 JSON（第 ${attempt} 次），原始内容前 500 字: ${raw.content.slice(0, 500)}`;
        continue;
      }

      const result = validate(raw.parsed);
      if (result.success && result.data) {
        return { data: result.data, raw };
      }

      const errs = extractErrors(result);
      lastError = errs.join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    `${lastError}\n[最后一次 LLM 原始输出前 800 字]: ${lastRawContent.slice(0, 800)}`
  );
}
