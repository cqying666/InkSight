import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const MAX_ENTRIES = 50;

/**
 * 拆文历史 CRUD API
 * GET    /api/teardown-history  — 获取全部历史
 * POST   /api/teardown-history  — 追加一条
 * DELETE /api/teardown-history   — 清空全部
 */

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT data FROM teardown_history ORDER BY id ASC")
    .all() as { data: string }[];
  const entries = rows.map((r) => JSON.parse(r.data));
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const entry = await request.json();
  const data = JSON.stringify(entry);
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(
    "INSERT INTO teardown_history (data, created_at) VALUES (?, ?)"
  ).run(data, now);

  // FIFO 截断到 MAX_ENTRIES
  const count = db.prepare("SELECT COUNT(*) as c FROM teardown_history").get() as {
    c: number;
  };
  if (count.c > MAX_ENTRIES) {
    db.prepare(
      "DELETE FROM teardown_history WHERE id NOT IN (SELECT id FROM teardown_history ORDER BY id DESC LIMIT ?)"
    ).run(MAX_ENTRIES);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const db = getDb();
  db.prepare("DELETE FROM teardown_history").run();
  return NextResponse.json({ success: true });
}
