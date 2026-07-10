import { NextRequest } from "next/server";
import { getModel } from "@/lib/llm/client";

/**
 * AI 教练对话 API（流式）
 * POST /api/coach
 *
 * Body: {
 *   messages: { role: "user" | "assistant", content: string }[]
 *   context?: { title?: string; wordCount?: number; excerpt?: string }
 * }
 *
 * 返回：text/plain 流（SSE 风格，逐 token 输出）
 */

export const runtime = "edge";

const SYSTEM_PROMPT = `你是 InkSight 的创作教练，一位经验丰富的短篇小说编辑。

你的职责：
- 帮助创作者解决具体的写作问题（节奏、转折、人物动机、对话语气等）
- 给出简洁、可操作的建议，不要泛泛而谈
- 每次回复控制在 2-4 句话，像一个坐在旁边的编辑随口说的建议
- 不要使用 markdown 标题、列表等格式，用自然对话的语气
- 如果创作者贴了正文片段，针对具体段落给建议，不要复述原文
- 语气克制、专业、温暖但不煽情`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, context } = body as {
      messages: { role: string; content: string }[];
      context?: { title?: string; wordCount?: number; excerpt?: string };
    };

    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response("AI 教练未配置，请联系管理员设置 LLM_API_KEY", {
        status: 503,
      });
    }

    const baseURL = process.env.LLM_BASE_URL || "https://api.deepseek.com";
    const model = getModel();

    // 构建上下文描述
    let contextHint = "";
    if (context?.title || context?.wordCount || context?.excerpt) {
      const parts: string[] = [];
      if (context.title) parts.push(`当前作品标题：${context.title}`);
      if (context.wordCount) parts.push(`已写 ${context.wordCount} 字`);
      if (context.excerpt) parts.push(`最近段落：${context.excerpt.slice(0, 200)}`);
      contextHint = `\n\n[创作者当前状态]\n${parts.join("\n")}`;
    }

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT + contextHint },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!resp.ok || !resp.body) {
      return new Response(`AI 服务异常 (${resp.status})`, { status: 502 });
    }

    // 将 OpenAI SSE 流转换为纯文本流
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          } catch {
            // 跳过不完整的 JSON
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("AI 教练请求失败", { status: 500 });
  }
}
