import { NextRequest, NextResponse } from "next/server";
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  setActiveModel,
  maskApiKey,
  type AIModelConfig,
} from "@/lib/ai/models";

/**
 * AI 模型接入配置 CRUD API
 *
 * GET    /api/ai-models            — 列出全部模型（apiKey 脱敏）
 * POST   /api/ai-models            — 新建模型
 * PUT    /api/ai-models?id=xxx     — 更新模型
 * PUT    /api/ai-models?id=xxx&action=activate — 设为激活
 * DELETE /api/ai-models?id=xxx     — 删除模型
 */

function sanitize(config: AIModelConfig) {
  return {
    ...config,
    apiKey: maskApiKey(config.apiKey),
  };
}

export async function GET() {
  const models = listModels();
  return NextResponse.json(models.map(sanitize));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const { name, provider, baseURL, apiKey, model, isActive } = body;
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
  });
  return NextResponse.json(sanitize(created), { status: 201 });
}

export async function PUT(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const action = request.nextUrl.searchParams.get("action");

  if (action === "activate") {
    const ok = setActiveModel(id);
    if (!ok) return NextResponse.json({ error: "模型不存在" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const updated = updateModel(id, {
    name: body.name,
    provider: body.provider,
    baseURL: body.baseURL,
    apiKey: body.apiKey,
    model: body.model,
  });
  if (!updated) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }
  return NextResponse.json(sanitize(updated));
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }
  const ok = deleteModel(id);
  if (!ok) return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  return NextResponse.json({ success: true });
}
