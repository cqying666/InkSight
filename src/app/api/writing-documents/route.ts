import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/**
 * 创作文档 CRUD API（key-value 存储）
 * GET    /api/writing-documents?key=draft       — 获取单条
 * GET    /api/writing-documents                  — 获取全部
 * PUT    /api/writing-documents                  — upsert（body 含 key）
 * POST   /api/writing-documents                  — 服务端合并操作（works 专用，防止竞态）
 * DELETE /api/writing-documents?key=draft        — 删除单条
 *
 * 数据隔离：所有 key 在服务端按当前登录用户命名空间存储
 * （实际落盘为 `u:{userId}:{key}`），防止多用户间的数据泄露与覆盖。
 */

interface WorksMergeOp {
  op: "upsert" | "delete" | "updateDocuments" | "updateSale" | "clearSale";
  work?: Record<string, unknown>;
  workId?: string;
  documents?: Record<string, unknown>;
  sale?: Record<string, unknown>;
}

function scopeKey(userId: string, key: string): string {
  return `u:${userId}:${key}`;
}

/**
 * 服务端合并 works 操作
 *
 * 解决客户端 read-modify-write 竞态：
 * 客户端不再加载 works → 本地修改 → 保存的模式，
 * 而是将变更意图发送给服务端，由服务端在单次事务中完成读-改-写。
 * 这彻底消除了多标签页并发导致的数据丢失。
 *
 * 数据隔离：按 userId 命名空间读写，避免跨用户数据串扰。
 */
function handleWorksMerge(userId: string, ops: WorksMergeOp[]): {
  success: boolean;
  data: unknown[] | null;
  error?: string;
} {
  const WORKS_KEY = scopeKey(userId, "works");
  const db = getDb();

  // 预检：拒绝已带 u: 前缀的 ID，防止二次前缀化导致孤儿数据
  for (const op of ops) {
    switch (op.op) {
      case "upsert":
        if (op.work && typeof op.work.id === "string" && op.work.id.startsWith("u:")) {
          throw new Error("work.id 包含非法前缀，数据可能已损坏，请重新提交");
        }
        break;
      case "delete":
      case "updateDocuments":
      case "updateSale":
      case "clearSale":
        if (op.workId && op.workId.startsWith("u:")) {
          throw new Error("workId 包含非法前缀，数据可能已损坏，请重新提交");
        }
        break;
    }
  }

  const txn = db.transaction(() => {
    const row = db
      .prepare("SELECT data FROM writing_documents WHERE key = ?")
      .get(WORKS_KEY) as { data: string } | undefined;
    let works: Record<string, unknown>[] = row ? JSON.parse(row.data) : [];

    for (const op of ops) {
      switch (op.op) {
        case "upsert": {
          const work = op.work;
          if (!work || typeof work.id !== "string") {
            throw new Error("upsert 操作需要 work 对象且含 id");
          }
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === work.id
          );
          if (idx >= 0) {
            works[idx] = { ...works[idx], ...work };
          } else {
            works.unshift(work);
          }
          break;
        }
        case "delete": {
          if (!op.workId) throw new Error("delete 操作需要 workId");
          works = works.filter(
            (w) => (w as Record<string, unknown>).id !== op.workId
          );
          break;
        }
        case "updateDocuments": {
          if (!op.workId || !op.documents)
            throw new Error("updateDocuments 需要 workId 和 documents");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) {
            works[idx] = { ...works[idx], documents: op.documents };
          }
          break;
        }
        case "updateSale": {
          if (!op.workId || !op.sale)
            throw new Error("updateSale 需要 workId 和 sale");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) {
            works[idx] = { ...works[idx], sale: op.sale };
          }
          break;
        }
        case "clearSale": {
          if (!op.workId) throw new Error("clearSale 需要 workId");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) {
            const { sale: _sale, ...rest } = works[idx] as Record<string, unknown>;
            works[idx] = rest;
          }
          break;
        }
        default:
          throw new Error(`未知操作: ${(op as WorksMergeOp).op}`);
      }
    }

    const now = new Date().toISOString();
    const serialized = JSON.stringify(works);
    db.prepare(
      `INSERT INTO writing_documents (key, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET data = ?, updated_at = ?`
    ).run(WORKS_KEY, serialized, now, serialized, now);

    return works;
  });

  try {
    const result = txn();
    return { success: true, data: result };
  } catch (e) {
    return {
      success: false,
      data: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const userId = session.sub;

  const db = getDb();
  if (key) {
    // 先尝试 scoped key
    let row = db
      .prepare("SELECT data FROM writing_documents WHERE key = ?")
      .get(scopeKey(userId, key)) as { data: string } | undefined;
    // 回退：仅 admin 可尝试旧的 unscoped key 并即时迁移。
    // 非 admin 用户的 unscoped fallback 会造成「先到先得」数据盗窃：
    // 非 admin 首次读某个 unscoped key（例如 admin 遗留的草稿）时，
    // 该 key 会被重命名到非 admin 的命名空间下，永久剥夺真实所有者的访问权。
    if (!row && session.role === "admin") {
      // 安全防护：拒绝已是 scoped key 的查询，防止跨用户数据泄漏
      if (key.startsWith("u:")) {
        return NextResponse.json(null);
      }
      row = db
        .prepare("SELECT data FROM writing_documents WHERE key = ?")
        .get(key) as { data: string } | undefined;
      if (row) {
        const scopedKey = scopeKey(userId, key);
        const exists = db
          .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
          .get(scopedKey);
        if (!exists) {
          db.prepare("UPDATE writing_documents SET key = ? WHERE key = ?").run(
            scopedKey,
            key
          );
        }
      }
    }
    if (!row) return NextResponse.json(null);
    try {
      return NextResponse.json(JSON.parse(row.data));
    } catch {
      return NextResponse.json({ error: "数据损坏" }, { status: 500 });
    }
  }

  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT key, data FROM writing_documents WHERE key LIKE ?")
    .all(`${prefix}%`) as { key: string; data: string }[];

  // 回退：仅 admin 可触发 unscoped 批量迁移。
  // 高危：此处若允许任意非 admin 用户迁移，会把库内所有遗留的 unscoped 文档
  // （含其他用户/管理员的数据）一次性划入第一个命中此路径的用户名下，
  // 造成跨用户数据窃取 + 原所有者永久数据丢失。
  if (rows.length === 0 && session.role === "admin") {
    const unscoped = db
      .prepare("SELECT key, data FROM writing_documents WHERE key NOT LIKE 'u:%'")
      .all() as { key: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newKey = prefix + oldRow.key;
        const exists = db
          .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
          .get(newKey);
        if (!exists) {
          db.prepare("UPDATE writing_documents SET key = ? WHERE key = ?").run(
            newKey,
            oldRow.key
          );
        }
      }
      rows = unscoped.map((r) => ({ key: prefix + r.key, data: r.data }));
    }
  }

  const result: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      const bareKey = r.key.slice(prefix.length);
      result[bareKey] = JSON.parse(r.data);
    } catch {
      // 跳过损坏的行
    }
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json();
  const { key, data: payload } = body;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key 必填" }, { status: 400 });
  }
  // 安全防护：拒绝已是 scoped key 的写入，防止跨用户数据污染
  if (key.startsWith("u:")) {
    return NextResponse.json({ error: "key 包含非法前缀" }, { status: 400 });
  }
  const data = JSON.stringify(payload);
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO writing_documents (key, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET data = ?, updated_at = ?`
  ).run(scopeKey(session.sub, key), data, now, data, now);

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json();

  // Works 专用服务端合并：body.ops 为操作数组
  if (Array.isArray(body?.ops)) {
    const result = handleWorksMerge(session.sub, body.ops as WorksMergeOp[]);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "操作失败" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, data: result.data });
  }

  return NextResponse.json({ error: "body.ops 数组必填" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key 必填，不支持全表清空" }, { status: 400 });
  }
  // 安全防护：拒绝已是 scoped key 的删除，防止跨用户数据操作
  if (key.startsWith("u:")) {
    return NextResponse.json({ error: "key 包含非法前缀" }, { status: 400 });
  }

  const db = getDb();
  const scopedKey = scopeKey(session.sub, key);
  const result = db.prepare("DELETE FROM writing_documents WHERE key = ?").run(scopedKey);
  if (result.changes === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
