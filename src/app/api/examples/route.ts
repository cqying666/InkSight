import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { extractIntroSentences, type ExampleWork } from "@/lib/example";

/**
 * examples 采用与 writing_documents 一致的命名空间策略：
 * SQLite 中的逻辑 id = `u:{userId}:{clientId}`，实现多用户隔离。
 * 返回给前端时去掉 `u:{userId}:` 前缀，保持前端契约不变。
 */
function scopeExampleId(userId: string, id: string): string {
  return `u:${userId}:${id}`;
}
function unscopeExampleId(userId: string, scopedId: string): string {
  const prefix = `u:${userId}:`;
  return scopedId.startsWith(prefix) ? scopedId.slice(prefix.length) : scopedId;
}

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

function isExampleWork(value: unknown): value is ExampleWork {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExampleWork>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.text === "string" &&
    item.text.length <= 200_000 &&
    Array.isArray(item.paragraphs) &&
    Array.isArray(item.introSentences) &&
    Array.isArray(item.tags) &&
    (item.status === "uploaded" ||
      (item.status === "analyzed" &&
        typeof item.reportId === "string" &&
        (Boolean(item.analysis) || Boolean(item.guideAnalysis))))
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const db = getDb();
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    // 先尝试 scoped ID
    let row = db
      .prepare("SELECT data FROM examples WHERE id = ?")
      .get(scopeExampleId(userId, id)) as { data: string } | undefined;
    // 回退：仅 admin 可尝试旧的 unscoped ID 并即时迁移。
    // 非 admin 用户的 unscoped fallback 会造成「先到先得」数据盗窃：
    // 非 admin 首次读某个 unscoped 例文 id（例如 admin 遗留的爆款例文）时，
    // 该行会被重命名到非 admin 的命名空间下，永久剥夺真实所有者的访问权。
    if (!row && auth.role === "admin") {
      row = db
        .prepare("SELECT data FROM examples WHERE id = ?")
        .get(id) as { data: string } | undefined;
      if (row) {
        const scopedId = scopeExampleId(userId, id);
        const exists = db.prepare("SELECT 1 FROM examples WHERE id = ?").get(scopedId);
        if (!exists) {
          db.prepare("UPDATE examples SET id = ? WHERE id = ?").run(scopedId, id);
        }
      }
    }
    if (!row) {
      return NextResponse.json({ error: "例文不存在" }, { status: 404 });
    }
    const stored = JSON.parse(row.data) as ExampleWork;
    return NextResponse.json({ ...stored, id: unscopeExampleId(userId, stored.id) });
  }

  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT id, data FROM examples WHERE id LIKE ? ORDER BY updated_at DESC")
    .all(`${prefix}%`) as { id: string; data: string }[];

  // 回退：仅 admin 可触发 unscoped 批量迁移。
  // 高危：此处若允许任意非 admin 用户迁移，会把库内所有遗留的 unscoped 例文
  // （含其他用户/管理员上传的爆款全文分析数据）一次性划入第一个命中此路径的用户名下，
  // 造成跨用户数据窃取 + 原所有者永久数据丢失。
  if (rows.length === 0 && auth.role === "admin") {
    const unscoped = db
      .prepare("SELECT id, data FROM examples WHERE id NOT LIKE 'u:%' ORDER BY updated_at DESC")
      .all() as { id: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newId = prefix + oldRow.id;
        const exists = db.prepare("SELECT 1 FROM examples WHERE id = ?").get(newId);
        if (!exists) {
          db.prepare("UPDATE examples SET id = ? WHERE id = ?").run(newId, oldRow.id);
        }
      }
      rows = unscoped.map((r) => ({ id: prefix + r.id, data: r.data }));
    }
  }

  const summaries = rows.map((row) => {
    const stored = JSON.parse(row.data) as ExampleWork;
    const { text: _text, paragraphs: _paragraphs, analysis: _analysis, ...summary } =
      stored;
    return {
      ...summary,
      id: unscopeExampleId(userId, row.id),
      introSentences: extractIntroSentences(stored.text),
    };
  });
  return NextResponse.json(summaries);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const example = await request.json();
  if (!isExampleWork(example)) {
    return NextResponse.json({ error: "例文数据不完整" }, { status: 400 });
  }
  // 拒绝已带 u: 前缀的 ID，防止二次前缀化导致数据损坏
  if (example.id.startsWith("u:")) {
    return NextResponse.json(
      { error: "id 包含非法前缀，数据可能已损坏，请重新提交" },
      { status: 400 }
    );
  }
  const normalized: ExampleWork = {
    ...example,
    introSentences: extractIntroSentences(example.text),
  };
  const scopedId = scopeExampleId(userId, normalized.id);
  // JSON blob 内的 id 保持 unscoped 形式（与 migration 后的数据格式一致），
  // scoped 隔离仅通过 SQLite 主键实现。
  const data = JSON.stringify(normalized);
  const db = getDb();
  db.prepare(
    `INSERT INTO examples (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(scopedId, data, normalized.updatedAt);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少例文 id" }, { status: 400 });
  }
  if (id.startsWith("u:")) {
    return NextResponse.json(
      { error: "id 包含非法前缀" },
      { status: 400 }
    );
  }
  const db = getDb();
  const scopedPk = scopeExampleId(userId, id);
  const result = db.prepare("DELETE FROM examples WHERE id = ?").run(scopedPk);
  if (result.changes === 0) {
    return NextResponse.json({ error: "例文不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
