import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * 素材库 CRUD API
 * GET    /api/materials          — 获取全部素材
 * POST   /api/materials          — upsert 单条素材
 * DELETE /api/materials           — 清空全部
 * DELETE /api/materials?id=xxx   — 删除单条
 */

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT data FROM materials ORDER BY updated_at DESC")
    .all() as { data: string }[];
  const materials = rows.map((r) => JSON.parse(r.data));
  return NextResponse.json(materials);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, ...rest } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }
  const data = JSON.stringify(body);
  const now = new Date().toISOString();
  const updatedAt = body.updatedAt || now;

  const db = getDb();
  db.prepare(
    `INSERT INTO materials (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?`
  ).run(id, data, updatedAt, data, updatedAt);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const db = getDb();
  if (id) {
    db.prepare("DELETE FROM materials WHERE id = ?").run(id);
  } else {
    db.prepare("DELETE FROM materials").run();
  }
  return NextResponse.json({ success: true });
}
