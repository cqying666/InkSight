import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  setModelActive,
  maskApiKey,
  type AIModelConfig,
} from "@/lib/ai/models";

/**
 * 在 middleware 鉴权之上，路由层再做一次管理员校验，形成纵深防御。
 * 避免 matcher 调整 / edge 回退 / 新路由误注册等情况下的权限绕过。
 */
async function requireAdmin(): Promise<Response | null> {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "鉴权失败" }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return null;
}

/**
 * AI 模型接入配置 CRUD API
 *
 * GET    /api/ai-models            — 列出全部模型（apiKey 脱敏）
 * POST   /api/ai-models            — 新建模型
 * PUT    /api/ai-models?id=xxx     — 更新模型
 * PUT    /api/ai-models?id=xxx&action=activate&value=true|false — 启用/禁用
 * DELETE /api/ai-models?id=xxx     — 删除模型
 */

function sanitize(config: AIModelConfig) {
  return {
    ...config,
    apiKey: maskApiKey(config.apiKey),
  };
}

const PiModelSpecSchema = z.object({
  contextWindow: z.coerce.number().int().min(256).max(1_000_000).optional(),
  maxTokens: z.coerce.number().int().min(256).max(1_000_000).optional(),
  supportsReasoning: z.boolean().optional(),
});

function readPiModelSpec(body: unknown): {
  contextWindow?: number;
  maxTokens?: number;
  supportsReasoning?: boolean;
} | null {
  const parsed = PiModelSpecSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const models = listModels();
  return NextResponse.json(models.map(sanitize));
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const { name, provider, baseURL, apiKey, model, isActive } = body;
  const piSpec = readPiModelSpec(body);
  if (!piSpec) {
    return NextResponse.json({ error: "Pi 模型规格无效" }, { status: 400 });
  }
  if (!name || !provider || !baseURL || !apiKey || !model) {
    return NextResponse.json(
      { error: "name / provider / baseURL / apiKey / model 均为必填" },
      { status: 400 }
    );
  }

  const created = createModel({
    name,
    provider,
    baseURL,
    apiKey,
    model,
    isActive: Boolean(isActive),
    ...piSpec,
  });
  return NextResponse.json(sanitize(created), { status: 201 });
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const action = request.nextUrl.searchParams.get("action");

  if (action === "activate") {
    // value=true 启用 / value=false 禁用，不影响其他模型
    const value = request.nextUrl.searchParams.get("value");
    const active = value !== "false";
    const ok = setModelActive(id, active);
    if (!ok) return NextResponse.json({ error: "模型不存在" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const piSpec = readPiModelSpec(body);
  if (!piSpec) {
    return NextResponse.json({ error: "Pi 模型规格无效" }, { status: 400 });
  }

  const updated = updateModel(id, {
    name: body.name,
    provider: body.provider,
    baseURL: body.baseURL,
    apiKey: body.apiKey,
    model: body.model,
    ...piSpec,
  });
  if (!updated) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }
  return NextResponse.json(sanitize(updated));
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }
  const ok = deleteModel(id);
  if (!ok) return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  return NextResponse.json({ success: true });
}
