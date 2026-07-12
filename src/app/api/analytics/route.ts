import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const MAX_EVENTS = 500;

/**
 * 埋点事件 CRUD API
 * GET    /api/analytics  — 获取全部事件
 * POST   /api/analytics  — 批量插入（body: { events: [...] }）
 * DELETE /api/analytics   — 清空全部（drain）
 */

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare("SELECT name, ts, sid, props FROM analytics_events ORDER BY id ASC")
    .all() as { name: string; ts: string; sid: string; props: string | null }[];
  const events = rows.map((r) => ({
    name: r.name,
    ts: r.ts,
    sid: r.sid,
    props: r.props ? JSON.parse(r.props) : {},
  }));
  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const events = Array.isArray(body) ? body : body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events 数组必填" }, { status: 400 });
  }

  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO analytics_events (name, ts, sid, props) VALUES (?, ?, ?, ?)"
  );
  const insertMany = db.transaction((items: typeof events) => {
    for (const e of items) {
      insert.run(e.name, e.ts, e.sid, JSON.stringify(e.props ?? {}));
    }
  });
  insertMany(events);

  // 截断到 MAX_EVENTS
  const count = db.prepare("SELECT COUNT(*) as c FROM analytics_events").get() as {
    c: number;
  };
  if (count.c > MAX_EVENTS) {
    db.prepare(
      "DELETE FROM analytics_events WHERE id NOT IN (SELECT id FROM analytics_events ORDER BY id DESC LIMIT ?)"
    ).run(MAX_EVENTS);
  }

  return NextResponse.json({ success: true, inserted: events.length });
}

export async function DELETE() {
  const db = getDb();
  db.prepare("DELETE FROM analytics_events").run();
  return NextResponse.json({ success: true });
}
