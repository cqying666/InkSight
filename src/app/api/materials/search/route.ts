import { NextRequest, NextResponse } from "next/server";
import { searchVector } from "@/lib/material/zvec-index";
import type { SearchOpts } from "@/lib/material/search-tfidf";

/**
 * 素材向量语义搜索 API
 * POST /api/materials/search
 *
 * Body: {
 *   query: string
 *   opts?: SearchOpts（topN、layer、source、novelType 等）
 * }
 *
 * 返回：SearchResult[]（含素材对象和相似度分数）
 *
 * 注意：Node.js runtime（非 edge），依赖 Zvec native addon + onnxruntime-node
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, opts } = body as {
      query: string;
      opts?: SearchOpts;
    };

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "query 必填" },
        { status: 400 }
      );
    }

    const results = await searchVector(query, opts);

    return NextResponse.json({
      results,
      query,
      count: results.length,
      engine: "zvec",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "向量搜索失败";
    return NextResponse.json(
      { error: message, fallback: "tfidf" },
      { status: 500 }
    );
  }
}
