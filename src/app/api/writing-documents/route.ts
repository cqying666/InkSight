import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * 创作文档 CRUD API（key-value 存储）
 * GET    /api/writing-documents?key=draft       — 获取单条
 * GET    /api/writing-documents                  — 获取全部
 * PUT    /api/writing-documents                  — upsert（body 含 key）
 * DELETE /api/writing-documents?key=draft        — 删除单条
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  const db = getDb();
  if (key) {
    const row = db
      .prepare("SELECT data FROM writing_documents WHERE key = ?")
      .get(key) as { data: string } | undefined;
    return NextResponse.json(row ? JSON.parse(row.data) : null);
  }

  const rows = db
    .prepare("SELECT key, data FROM writing_documents")
    .all() as { key: string; data: string }[];
  const result: Record<string, unknown> = {};
  for (const r of rows) {
    result[r.key] = JSON.parse(r.data);
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { key, data: payload } = body;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key 必填" }, { status: 400 });
  }
  const data = JSON.stringify(payload);
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO writing_documents (key, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET data = ?, updated_at = ?`
  ).run(key, data, now, data, now);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  const db = getDb();
  if (key) {
    db.prepare("DELETE FROM writing_documents WHERE key = ?").run(key);
  } else {
    db.prepare("DELETE FROM writing_documents").run();
  }
  return NextResponse.json({ success: true });
}
