import { NextRequest, NextResponse } from "next/server";
import { buildIndex } from "@/lib/material/zvec-index";

/**
 * 素材向量索引管理 API
 * POST /api/materials/index — 构建或重建索引
 * GET  /api/materials/index — 检查索引状态
 *
 * 注意：Node.js runtime（非 edge），依赖 Zvec native addon + onnxruntime-node
 * 首次构建时会下载 embedding 模型（~100MB），耗时较长
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 检查索引状态
    return NextResponse.json({
      ready: true,
      message: "索引服务可用",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ready: false,
        error: err instanceof Error ? err.message : "索引服务不可用",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 构建索引（可能耗时较长，首次需下载模型）
    const result = await buildIndex();

    return NextResponse.json({
      success: true,
      ...result,
      message: `索引构建完成：共 ${result.indexed}/${result.total} 条素材`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "索引构建失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
