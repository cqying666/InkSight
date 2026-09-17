import { NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { logCall } from "@/lib/ai/logs";
import { runPiAgent } from "@/lib/pi/agent";
import { readCoachSession } from "@/lib/coach/session-store";
import {
  buildOutlineAgentSystemPrompt,
  compactOutlineConversation,
  readCurrentOutline,
  readLinkedDocuments,
  readRecentTeardown,
  searchOutlineMaterials,
  type OutlineAgentToolResult,
} from "@/lib/coach/outline-agent";

export const runtime = "nodejs";

const OutlineCoachRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(12_000),
      })
    )
    .min(1)
    .max(30),
  modelId: z.string().max(160).optional(),
  sessionId: z.string().max(160).optional(),
  context: z.object({
    title: z.string().max(200).optional(),
    wordCount: z.number().nonnegative().max(1_000_000).optional(),
    activePanel: z.literal("outline"),
    panelContent: z.string().max(20_000),
    references: z
      .array(
        z.object({
          id: z.string().max(160),
          kind: z.enum(["document", "material"]),
          label: z.string().max(120),
          content: z.string().max(20_000),
          implicit: z.boolean().optional(),
        })
      )
      .max(12)
      .default([]),
  }),
});

type SseController = ReadableStreamDefaultController<Uint8Array>;

function sendEvent(
  controller: SseController,
  event: "tool_start" | "tool_end" | "text" | "error" | "done",
  data: Record<string, unknown>
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  try {
    controller.enqueue(new TextEncoder().encode(payload));
  } catch {
    // 客户端已取消请求时忽略尾部事件。
  }
}

function sendToolStart(controller: SseController, tool: OutlineAgentToolResult): void {
  sendEvent(controller, "tool_start", { id: tool.id, label: tool.label });
}

function sendToolEnd(controller: SseController, tool: OutlineAgentToolResult): void {
  sendEvent(controller, "tool_end", {
    id: tool.id,
    label: tool.label,
    status: tool.status,
    detail: tool.detail,
  });
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await getSession();
  } catch {
    return new Response("鉴权失败", { status: 500 });
  }
  if (!session) return new Response("未登录", { status: 401 });

  const parsed = OutlineCoachRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response("大纲教练请求内容不完整，请减少引用后重试", {
      status: 400,
    });
  }

  const { messages, modelId, sessionId, context } = parsed.data;
  const trustedSessionId = sessionId && readCoachSession(session.sub, sessionId)
    ? sessionId
    : undefined;
  const upstreamAbort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
      const startedAt = Date.now();

      try {
        const outlineSeed = readCurrentOutline(context.panelContent);
        sendToolStart(controller, outlineSeed);
        sendToolEnd(controller, outlineSeed);

        const linkedSeed = readLinkedDocuments(context.references);
        sendToolStart(controller, linkedSeed);
        sendToolEnd(controller, linkedSeed);

        const teardownSeed = readRecentTeardown(session.sub);
        sendToolStart(controller, teardownSeed);
        sendToolEnd(controller, teardownSeed);

        const materialSeed: OutlineAgentToolResult = {
          id: "search_materials",
          label: "检索素材库",
          status: "complete",
          detail: "正在检索",
          contextBlock: "",
        };
        sendToolStart(controller, materialSeed);
        const materials = await searchOutlineMaterials(
          session.sub,
          messages.at(-1)?.content ?? ""
        );
        sendToolEnd(controller, materials);

        const systemPrompt = buildOutlineAgentSystemPrompt(
          {
            outline: outlineSeed,
            linkedDocuments: linkedSeed,
            recentTeardown: teardownSeed,
            materials,
          },
          context.title
        );

        const result = await runPiAgent({
          systemPrompt,
          messages: compactOutlineConversation(messages),
          modelId,
          temperature: 0.4,
          maxTokens: 1_200,
          timeoutMs: 60_000,
          sessionId: trustedSessionId,
          signal: upstreamAbort.signal,
          onTextDelta: (delta) => sendEvent(controller, "text", { delta }),
        });

        logCall({
          model: result.model,
          feature: "coach-outline-agent",
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          durationMs: result.durationMs,
          success: true,
        });
        sendEvent(controller, "done", {});
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "大纲教练响应超时，请稍后重试"
            : "大纲教练暂时无法完成本次分析，请稍后重试";
        logCall({
          model: "pi-agent",
          feature: "coach-outline-agent",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs: Date.now() - startedAt,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        sendEvent(controller, "error", { message });
      } finally {
        try {
          controller.close();
        } catch {
          // 客户端已主动中断时，流可能已经关闭。
        }
      }
      })();
    },
    cancel() {
      upstreamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
