import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

const MAX_EVENTS = 500;

/**
 * 埋点事件 CRUD API（每用户隔离）
 * GET    /api/analytics                       — 获取「当前用户」全部事件
 * POST   /api/analytics                       — 批量插入（body: { events: [...] }），自动绑定当前用户
 * DELETE /api/analytics                       — 清空「当前用户」全部事件
 *
 * 数据库中 sid 沿用为会话/设备级标识，本层再以 user_id 列做登录态归属隔离，
 * 防止未登录用户篡改/删除他人事件。
 */

async function requireAuth() {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "鉴权失败" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return session;
}

let analyticsColumnEnsured = false;
function ensureUserIdColumn(db: ReturnType<typeof import("@/lib/db").getDb>) {
  if (analyticsColumnEnsured) return;
  try {
    db.prepare(`ALTER TABLE analytics_events ADD COLUMN user_id TEXT`).run();
  } catch {
    // 列已存在，忽略
  }
  try {
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, id DESC)`
    ).run();
  } catch {
    // 索引已存在，忽略
  }
  analyticsColumnEnsured = true;
}

export async function GET() {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const db = getDb();
  ensureUserIdColumn(db);
  const rows = db
    .prepare(
      "SELECT name, ts, sid, props FROM analytics_events WHERE user_id = ? ORDER BY id ASC"
    )
    .all(userId) as { name: string; ts: string; sid: string; props: string | null }[];
  const events = rows.map((r) => ({
    name: r.name,
    ts: r.ts,
    sid: r.sid,
    props: r.props ? JSON.parse(r.props) : {},
  }));
  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const body = await request.json();
  const events = Array.isArray(body) ? body : body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events 数组必填" }, { status: 400 });
  }

  const db = getDb();
  ensureUserIdColumn(db);
  const insert = db.prepare(
    "INSERT INTO analytics_events (name, ts, sid, props, user_id) VALUES (?, ?, ?, ?, ?)"
  );
  const insertMany = db.transaction((items: typeof events) => {
    for (const e of items) {
      insert.run(e.name, e.ts, e.sid, JSON.stringify(e.props ?? {}), userId);
    }
  });
  insertMany(events);

  // 截断到 MAX_EVENTS（按当前用户粒度，避免跨用户互相截断）
  const count = db
    .prepare("SELECT COUNT(*) as c FROM analytics_events WHERE user_id = ?")
    .get(userId) as { c: number };
  if (count.c > MAX_EVENTS) {
    db.prepare(
      `DELETE FROM analytics_events
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM analytics_events
             WHERE user_id = ? ORDER BY id DESC LIMIT ?
          )`
    ).run(userId, userId, MAX_EVENTS);
  }

  return NextResponse.json({ success: true, inserted: events.length });
}

export async function DELETE() {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const db = getDb();
  ensureUserIdColumn(db);
  db.prepare("DELETE FROM analytics_events WHERE user_id = ?").run(userId);
  return NextResponse.json({ success: true });
}
