import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

const MAX_ENTRIES = 50;

/**
 * teardown_history 采用每用户隔离：
 *  - 新增列 user_id（文本）。所有读写都带 user_id 过滤，避免跨用户串扰。
 *  - DELETE 仅允许删除当前登录用户的记录，并支持单条 / 全部两种粒度：
 *    DELETE /api/teardown-history          — 清空「当前用户」全部历史
 *    DELETE /api/teardown-history?id=xxx   — 删除「当前用户」单条记录
 *  不再提供全局清空能力。
 *
 * 旧数据迁移：历史上以无 user_id 写入的记录，读时默认视为孤儿数据，
 * 不返回给任何用户（避免串给当前用户）。
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

let teardownColumnEnsured = false;
function ensureUserIdColumn(db: ReturnType<typeof import("@/lib/db").getDb>) {
  if (teardownColumnEnsured) return;
  try {
    db.prepare(
      `ALTER TABLE teardown_history ADD COLUMN user_id TEXT`
    ).run();
  } catch {
    // user_id 列已存在（SQLite 对重复 ADD COLUMN 报错），忽略
  }
  try {
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_teardown_history_user ON teardown_history(user_id, id DESC)`
    ).run();
  } catch {
    // 索引已存在，忽略
  }
  teardownColumnEnsured = true;
}

export async function GET() {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const db = getDb();
  ensureUserIdColumn(db);
  const rows = db
    .prepare(
      "SELECT id, data FROM teardown_history WHERE user_id = ? ORDER BY id ASC"
    )
    .all(userId) as { id: number; data: string }[];
  const entries = rows.map((r) => JSON.parse(r.data));
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const entry = await request.json();
  const data = JSON.stringify(entry);
  const now = new Date().toISOString();

  const db = getDb();
  ensureUserIdColumn(db);
  db.prepare(
    "INSERT INTO teardown_history (data, created_at, user_id) VALUES (?, ?, ?)"
  ).run(data, now, userId);

  // FIFO 截断到 MAX_ENTRIES（仅针对当前用户，避免跨用户互相截断）
  const count = db
    .prepare("SELECT COUNT(*) as c FROM teardown_history WHERE user_id = ?")
    .get(userId) as { c: number };
  if (count.c > MAX_ENTRIES) {
    db.prepare(
      `DELETE FROM teardown_history
        WHERE user_id = ?
          AND id NOT IN (
            SELECT id FROM teardown_history
             WHERE user_id = ? ORDER BY id DESC LIMIT ?
          )`
    ).run(userId, userId, MAX_ENTRIES);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const id = request.nextUrl.searchParams.get("id");
  const db = getDb();
  ensureUserIdColumn(db);
  if (id) {
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "id 非法" }, { status: 400 });
    }
    const res = db
      .prepare("DELETE FROM teardown_history WHERE id = ? AND user_id = ?")
      .run(parsedId, userId);
    if (res.changes === 0) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }
  } else {
    // 清空当前用户自己的历史（不再提供全局清空）
    db.prepare("DELETE FROM teardown_history WHERE user_id = ?").run(userId);
  }
  return NextResponse.json({ success: true });
}
