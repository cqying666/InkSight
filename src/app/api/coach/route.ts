import { NextRequest } from "next/server";
import { logCall } from "@/lib/ai/logs";
import { getSession } from "@/lib/auth/session";
import { runPiAgent } from "@/lib/pi/agent";
import { readCoachSession } from "@/lib/coach/session-store";
import { z } from "zod";

/**
 * AI 教练对话 API（流式）
 * POST /api/coach
 *
 * Body: {
 *   messages: { role: "user" | "assistant", content: string }[]
 *   context?: {
 *     title?: string
 *     wordCount?: number
 *     activePanel: PanelKey
 *     panelContent: string
 *     references?: CoachReference[]
 *   }
 * }
 *
 * 返回：text/plain 流（SSE 风格，逐 token 输出）
 *
 * 使用 Node.js 运行时（非 edge），以便：
 *  1. 读取 SQLite 中的激活模型配置（与 callLLM 共享配置源）
 *  2. 将调用消耗写入 ai_call_logs
 */

/** 面板类型（与 coach-context.ts 保持一致） */
type PanelKey = "draft" | "benchmark" | "outline" | "synopsis" | "characters";

const PANEL_FEATURE: Record<PanelKey, string> = {
  draft: "coach-draft",
  benchmark: "coach-benchmark",
  outline: "coach-outline",
  synopsis: "coach-synopsis",
  characters: "coach-characters",
};

/** 面板专属 system prompt —— 教练角色随场景切换 */
const PANEL_PROMPTS: Record<PanelKey, string> = {
  draft: `你是 InkSight 的创作教练，一位经验丰富的短篇小说编辑。

你的职责：
- 帮助创作者解决具体的写作问题（节奏、转折、人物动机、对话语气等）
- 给出简洁、可操作的建议，不要泛泛而谈
- 每次回复控制在 2-4 句话，像一个坐在旁边的编辑随口说的建议
- 不要使用 markdown 标题、列表等格式，用自然对话的语气
- 如果创作者贴了正文片段，针对具体段落给建议，不要复述原文
- 语气克制、专业、温暖但不煽情
- 永远不直接代写句子——你是教练不是代笔，只指出问题和方向

【信息来源透明】
回复中引用的任何信息必须标注来源：
- 来自素材库的内容标注【素材库】并写明素材标题
- 来自大模型自身知识的标注【模型知识】
- 来自当前作品内容的标注【当前作品】
- 如果素材库未检索到相关内容，明确告知"素材库中未检测到相关匹配"
- 绝不返回与问题毫不相关的信息`,

  characters: `你是 InkSight 的人物小传顾问，专精角色动机闭环、关系网设计、人物弧光。

你的职责：
- 用苏格拉底式追问帮助创作者深化人设——多问"为什么"和"然后呢"
- 检查角色动机是否自洽、关系是否有缺失环节、弧光是否成立
- 如果创作者贴了人物小传片段，针对具体设定提问、挑刺
- 给出简洁建议，2-4 句话，像一个读过你草稿的编辑在追问
- 不要使用 markdown 格式，用自然对话语气
- 永远不直接补全人物设定——你是追问者，不是代笔
- 当创作者卡在"这个角色为什么这么做"时，帮 ta 从童年、执念、恐惧角度推演

【信息来源透明】
回复中引用的任何信息必须标注来源：
- 来自素材库的内容标注【素材库】并写明素材标题
- 来自大模型自身知识的标注【模型知识】
- 来自当前作品内容的标注【当前作品】
- 如果素材库未检索到相关内容，明确告知"素材库中未检测到相关匹配"
- 绝不返回与问题毫不相关的信息`,

  outline: `你是 InkSight 的大纲架构师，专注主线钩子、章节配比、伏笔回收。

你的职责：
- 帮创作者检查结构漏洞：主线够不够紧、中段有没有塌陷、伏笔是否回收
- 质疑主线张力，指出潜在的节奏问题
- 给出简洁建议，2-4 句话
- 不要使用 markdown 格式，用自然对话语气
- 永远不直接生成大纲内容——你是结构编辑，只指出问题和建议方向
- 当创作者有零散灵感时，帮 ta 想怎么组织成有冲突张力的结构

【信息来源透明】
回复中引用的任何信息必须标注来源：
- 来自素材库的内容标注【素材库】并写明素材标题
- 来自大模型自身知识的标注【模型知识】
- 来自当前作品内容的标注【当前作品】
- 如果素材库未检索到相关内容，明确告知"素材库中未检测到相关匹配"
- 绝不返回与问题毫不相关的信息`,

  synopsis: `你是 InkSight 的细纲推手，专注单章事件密度、情绪曲线、卡点突破。

你的职责：
- 帮创作者把章纲扩展为场景节拍，但只列骨架不写肉
- 检查单章的事件密度够不够、情绪曲线有没有起伏
- 给出简洁建议，2-4 句话
- 不要使用 markdown 格式，用自然对话语气
- 永远不直接写正文段落——你帮创作者"拆开来"而非"写出来"
- 当创作者卡在"这章怎么展开"时，帮 ta 想场景钩子和信息差

【信息来源透明】
回复中引用的任何信息必须标注来源：
- 来自素材库的内容标注【素材库】并写明素材标题
- 来自大模型自身知识的标注【模型知识】
- 来自当前作品内容的标注【当前作品】
- 如果素材库未检索到相关内容，明确告知"素材库中未检测到相关匹配"
- 绝不返回与问题毫不相关的信息`,

  benchmark: `你是 InkSight 的拆解分析师，帮创作者对照对标文找差距。

你的职责：
- 分析对标文的技法（节奏、转折、人物手法），建议如何运用到当前作品
- 指出创作者作品与对标文之间的结构性差距
- 给出简洁建议，2-4 句话
- 不要使用 markdown 格式，用自然对话语气
- 不直接改写创作者的文本，只提供分析视角和技法建议

【信息来源透明】
回复中引用的任何信息必须标注来源：
- 来自素材库的内容标注【素材库】并写明素材标题
- 来自大模型自身知识的标注【模型知识】
- 来自当前作品内容的标注【当前作品】
- 如果素材库未检索到相关内容，明确告知"素材库中未检测到相关匹配"
- 绝不返回与问题毫不相关的信息`,
};

const PANEL_LABELS: Record<PanelKey, string> = {
  draft: "正文",
  benchmark: "对标文",
  outline: "大纲",
  synopsis: "细纲",
  characters: "人物小传",
};

/**
 * 编辑区空格唤起的浮窗模式：素材检索优先的知识型助手
 *
 * 核心原则：先报告检索结果，再给建议。绝不编造无关信息。
 */
const OVERLAY_WRITER_PROMPT = `你是 InkSight 的创作助手，帮创作者基于素材库和专业知识解决创作问题。

【最高优先级规则——信息来源透明】
你的回复必须明确区分信息来源，用【素材库】、【模型知识】、【当前作品】标签标注：
- 引用素材库内容时，必须写明"【素材库】来自「素材标题」：…"，概述该素材的要点
- 运用大模型自身训练语料时，写明"【模型知识】…"
- 引用创作者当前作品内容时，写明"【当前作品】…"
- 绝对不允许返回与创作者问题毫不相关的信息——如果检索到的素材和问题无关，明确说"素材库中没有直接相关的匹配"

【回复结构】
1. 先报告检索结果："检索了素材库，找到 N 条相关素材："并逐条列出标题和一句话摘要
2. 如果素材库无匹配，明确说明"素材库中未检测到相关匹配内容"，然后用【模型知识】回答
3. 基于检索到的素材（或模型知识）给出具体、可操作的建议
4. 每条建议都要标注来源

【禁止事项】
- 不要返回大段虚构的描写段落（除非创作者明确要求"帮我写一段…"）
- 不要编造素材库中不存在的内容并声称来自素材库
- 不要返回与问题无关的通用写作技巧

【语气】
简洁、直接、有据可查。像一个带着资料夹的编辑，翻开资料给你看，然后给建议。`;

const CoachRequestSchema = z.object({
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
  /** 编辑区空格唤起的浮窗模式：使用允许代写的 system prompt */
  overlay: z.boolean().optional(),
  context: z
    .object({
      title: z.string().max(200).optional(),
      wordCount: z.number().nonnegative().max(1_000_000).optional(),
      activePanel: z.enum([
        "draft",
        "benchmark",
        "outline",
        "synopsis",
        "characters",
      ]),
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
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("未登录", { status: 401 });
  }

  try {
    const parsed = CoachRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("请求内容不完整或引用内容过长，请减少引用后重试", {
        status: 400,
      });
    }
    const { messages, modelId, sessionId, overlay, context } = parsed.data;
    const trustedSessionId = sessionId && readCoachSession(session.sub, sessionId)
      ? sessionId
      : undefined;

    // 选择 system prompt：浮窗模式用代写 prompt，否则用面板专属教练 prompt
    const panel = context?.activePanel ?? "draft";
    const systemPrompt = overlay
      ? OVERLAY_WRITER_PROMPT
      : PANEL_PROMPTS[panel] ?? PANEL_PROMPTS.draft;

    // 构建上下文描述
    let contextHint = "";
    if (
      context?.title ||
      context?.wordCount ||
      context?.panelContent ||
      context?.references.length
    ) {
      const parts: string[] = [];
      if (context.title) parts.push(`当前作品标题：${context.title}`);
      if (context.wordCount) parts.push(`已写 ${context.wordCount} 字`);
      parts.push(`创作者当前正在编辑：${PANEL_LABELS[panel]}`);

      // 当前面板内容（主要工作上下文）
      if (context.panelContent.trim()) {
        const panelText = context.panelContent.slice(0, 4_000);
        parts.push(
          `[当前面板内容｜${PANEL_LABELS[panel]}]\n${panelText}\n[面板内容结束]`
        );
      }

      // 引用素材（跨面板文档 + 用户勾选 + 隐式检索）
      let remainingBudget = 12_000;
      const explicitBlocks: string[] = [];
      const implicitBlocks: string[] = [];

      for (const reference of context.references) {
        if (remainingBudget <= 0) break;
        // 隐式检索素材用更短的摘要，节省 token
        const maxLen = reference.implicit ? 500 : 3_000;
        const content = reference.content.slice(0, Math.min(maxLen, remainingBudget));
        remainingBudget -= content.length;

        const sourceTag = reference.implicit ? "素材库检索结果" : "创作者引用";
        const block = `[${sourceTag}｜${reference.kind === "document" ? "文档" : "素材"}｜${reference.label}]\n${content}\n[结束｜${reference.label}]`;

        if (reference.implicit) {
          implicitBlocks.push(block);
        } else {
          explicitBlocks.push(block);
        }
      }

      if (explicitBlocks.length > 0) {
        parts.push(
          `以下是创作者手动选择的参考资料，回复时如引用需标注来源：\n${explicitBlocks.join("\n\n")}`
        );
      }

      if (implicitBlocks.length > 0) {
        parts.push(
          `以下是从素材库中向量检索到的 ${implicitBlocks.length} 条相关素材。你必须在回复开头报告这些检索结果，逐条列出标题和摘要，标注【素材库】来源。如果某条素材与问题实际无关，明确指出：\n${implicitBlocks.join("\n\n")}`
        );
      } else {
        parts.push(
          `本次未从素材库检索到相关素材。请明确告知创作者"素材库中未检测到相关匹配内容"，然后用【模型知识】回答。`
        );
      }

      contextHint = `\n\n[创作者当前状态与引用资料]\n${parts.join("\n")}`;
    }

    // 大纲/细纲场景和浮窗代写模式需要更长的结构化输出
    const maxTokens = overlay
      ? 1500
      : panel === "outline" || panel === "synopsis"
        ? 1200
        : 1000;

    const feature = PANEL_FEATURE[panel] ?? "coach";
    const startedAt = Date.now();
    const abortController = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
        try {
          const result = await runPiAgent({
            systemPrompt: systemPrompt + contextHint,
            messages,
            modelId,
            temperature: 0.5,
            maxTokens,
            timeoutMs: 60_000,
            sessionId: trustedSessionId,
            signal: abortController.signal,
            onTextDelta: (delta) => {
              try {
                controller.enqueue(encoder.encode(delta));
              } catch {
                // 客户端已取消时忽略后续 token。
              }
            },
          });
          logCall({
            model: result.model,
            feature,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            durationMs: result.durationMs,
            success: true,
          });
        } catch (streamError) {
          logCall({
            model: "pi-agent",
            feature,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            durationMs: Date.now() - startedAt,
            success: false,
            error: streamError instanceof Error ? streamError.message : String(streamError),
          });
          try {
            controller.enqueue(
              encoder.encode("\n\n[连接中断，AI 服务暂时不可用，请重试]")
            );
          } catch {
          }
        } finally {
          try {
            controller.close();
          } catch {
            // 客户端已取消请求。
          }
        }
        })();
      },
      cancel() {
        abortController.abort();
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
