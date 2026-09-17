import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import {
  upsertMaterialIndex,
  deleteMaterialIndex,
} from "@/lib/material/zvec-index";

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

/** 与 writing_documents 完全一致的命名空间策略 */
function scopeMaterialId(userId: string, id: string): string {
  return `u:${userId}:${id}`;
}

/** 校验 ID 未被二次前缀化（防止客户端提交已带 u: 前缀的 ID 导致数据损坏） */
function assertUnscopedId(id: string, label = "id"): void {
  if (id.startsWith("u:")) {
    throw new Error(`${label} 包含非法前缀，数据可能已损坏，请重新提交`);
  }
}

/**
 * 从 JSON blob 中取出/写入 unscoped id：
 *  - 读库后将 `id` 从 `u:userId:xxx` 还原为 `xxx`
 *  - 写库前把 payload.id（`xxx`）与数据库主键对齐，同时在 JSON 内保留 unscoped id，
 *    确保前端和 zvec 索引都仍使用原始 id 字符串
 */
function materialWithUnscopedId(
  scopedPk: string,
  userId: string,
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const prefix = `u:${userId}:`;
  const unscoped = scopedPk.startsWith(prefix) ? scopedPk.slice(prefix.length) : scopedPk;
  return { ...parsed, id: unscoped };
}

interface MaterialMergeOp {
  op:
    | "upsert"
    | "delete"
    | "toggleFavorite"
    | "setTags"
    | "setNotes"
    | "setFolder";
  id?: string;
  material?: Record<string, unknown>;
  tags?: string[];
  notes?: string;
  folder?: string | undefined;
  /**
   * toggleFavorite 专属：当素材尚未进入用户库时（预设 / 提取态首次收藏），
   * 用这里传进来的「素材快照」原子插入并 favorited=true。
   * 缺省则保持旧行为（不存在就抛错）。
   */
  fallback?: Record<string, unknown>;
}

/**
 * 服务端合并操作（每用户隔离）。
 *
 * zvec 向量索引与 JSON blob 内的 id 仍使用 unscoped id；
 * SQLite 主键使用 scoped id (`u:userId:xxx`) 实现物理隔离。
 */
function handleMaterialsMerge(
  userId: string,
  ops: MaterialMergeOp[],
  indexSync: {
    upsert: (m: Record<string, unknown>) => Promise<void>;
    remove: (id: string) => void;
  } | null
): {
  success: boolean;
  error?: string;
} {
  const db = getDb();

  // 预检：拒绝已带 u: 前缀的 ID，防止二次前缀化导致数据损坏
  for (const op of ops) {
    switch (op.op) {
      case "upsert":
        if (op.material && typeof op.material.id === "string") {
          assertUnscopedId(op.material.id, "material.id");
        }
        break;
      case "delete":
      case "toggleFavorite":
      case "setTags":
      case "setNotes":
      case "setFolder":
        if (op.id) assertUnscopedId(op.id, "id");
        break;
    }
  }

  // 收集索引变更操作，事务成功后才执行，避免回滚后索引污染
  const indexPending: Array<
    | { type: "upsert"; material: Record<string, unknown> }
    | { type: "remove"; id: string }
  > = [];

  const txn = db.transaction(() => {
    for (const op of ops) {
      switch (op.op) {
        case "upsert": {
          const material = op.material;
          if (!material || typeof material.id !== "string") {
            throw new Error("upsert 操作需要含 id 的 material 对象");
          }
          const now = new Date().toISOString();
          const scopedPk = scopeMaterialId(userId, material.id);
          const data = JSON.stringify({ ...material, updatedAt: now });
          db.prepare(
            `INSERT INTO materials (id, data, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?`
          ).run(scopedPk, data, now, data, now);
          if (indexSync) {
            indexPending.push({ type: "upsert", material: material as Record<string, unknown> });
          }
          break;
        }
        case "delete": {
          if (!op.id) throw new Error("delete 操作需要 id");
          const scopedPk = scopeMaterialId(userId, op.id);
          db.prepare("DELETE FROM materials WHERE id = ?").run(scopedPk);
          if (indexSync) {
            indexPending.push({ type: "remove", id: op.id });
          }
          break;
        }
        case "toggleFavorite": {
          if (!op.id) throw new Error("toggleFavorite 操作需要 id");
          const scopedPk = scopeMaterialId(userId, op.id);
          const row = db
            .prepare("SELECT data FROM materials WHERE id = ?")
            .get(scopedPk) as { data: string } | undefined;
          let material: Record<string, unknown>;
          if (row) {
            material = JSON.parse(row.data) as Record<string, unknown>;
            const current = Boolean(material.favorited);
            material.favorited = !current;
          } else {
            // 素材还不在用户库（预设 / 提取态首次收藏）。
            // 使用客户端上传的 fallback 快照原子插一条 favorited=true 的副本，
            // 避免客户端「先 upsert + 再 toggle」两次请求的竞态：
            // 任何一次失败都不会留下『未收藏却已在用户库』的孤儿脏数据。
            if (!op.fallback || typeof op.fallback !== "object") {
              throw new Error(`素材 ${op.id} 不存在`);
            }
            assertUnscopedId(String((op.fallback as { id?: unknown }).id ?? op.id), "fallback.id");
            material = {
              ...(op.fallback as Record<string, unknown>),
              id: op.id,
              favorited: true,
            };
          }
          material.updatedAt = new Date().toISOString();
          const data = JSON.stringify(material);
          if (row) {
            db.prepare(
              "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
            ).run(data, material.updatedAt, scopedPk);
          } else {
            db.prepare(
              `INSERT INTO materials (id, data, updated_at) VALUES (?, ?, ?)`
            ).run(scopedPk, data, material.updatedAt);
          }
          if (indexSync) {
            indexPending.push({ type: "upsert", material });
          }
          break;
        }
        case "setTags": {
          if (!op.id || !op.tags) throw new Error("setTags 操作需要 id 和 tags");
          const scopedPk = scopeMaterialId(userId, op.id);
          const row = db
            .prepare("SELECT data FROM materials WHERE id = ?")
            .get(scopedPk) as { data: string } | undefined;
          if (!row) throw new Error(`素材 ${op.id} 不存在`);
          const material = JSON.parse(row.data) as Record<string, unknown>;
          (["atom", "component", "inspiration"] as const).forEach((layer) => {
            const c = material[layer] as Record<string, unknown> | undefined;
            if (c) c.tags = op.tags;
          });
          material.updatedAt = new Date().toISOString();
          const data = JSON.stringify(material);
          db.prepare(
            "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
          ).run(data, material.updatedAt, scopedPk);
          if (indexSync) {
            indexPending.push({ type: "upsert", material });
          }
          break;
        }
        case "setNotes": {
          if (!op.id || op.notes === undefined)
            throw new Error("setNotes 操作需要 id 和 notes");
          const scopedPk = scopeMaterialId(userId, op.id);
          const row = db
            .prepare("SELECT data FROM materials WHERE id = ?")
            .get(scopedPk) as { data: string } | undefined;
          if (!row) throw new Error(`素材 ${op.id} 不存在`);
          const material = JSON.parse(row.data) as Record<string, unknown>;
          (["atom", "component", "inspiration"] as const).forEach((layer) => {
            const c = material[layer] as Record<string, unknown> | undefined;
            if (c) c.notes = op.notes;
          });
          material.updatedAt = new Date().toISOString();
          const data = JSON.stringify(material);
          db.prepare(
            "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
          ).run(data, material.updatedAt, scopedPk);
          // notes 字段会被 materialToText 纳入向量索引文本，
          // 漏掉此同步会导致语义搜索永远基于旧笔记内容，用户搜不到
          // 自己刚写的笔记关键词——属于可感知的搜索功能严重退化。
          if (indexSync) {
            indexPending.push({ type: "upsert", material });
          }
          break;
        }
        case "setFolder": {
          if (!op.id) throw new Error("setFolder 操作需要 id");
          const scopedPk = scopeMaterialId(userId, op.id);
          const row = db
            .prepare("SELECT data FROM materials WHERE id = ?")
            .get(scopedPk) as { data: string } | undefined;
          if (!row) throw new Error(`素材 ${op.id} 不存在`);
          const material = JSON.parse(row.data) as Record<string, unknown>;
          if (op.folder === undefined) {
            delete material.folder;
          } else {
            material.folder = op.folder;
          }
          material.updatedAt = new Date().toISOString();
          const data = JSON.stringify(material);
          db.prepare(
            "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
          ).run(data, material.updatedAt, scopedPk);
          break;
        }
        default:
          throw new Error(`未知操作: ${(op as MaterialMergeOp).op}`);
      }
    }
  });

  try {
    txn();
    // 事务成功后才同步索引，确保与 DB 数据一致
    if (indexSync && indexPending.length > 0) {
      queueMicrotask(() => {
        for (const entry of indexPending) {
          try {
            if (entry.type === "upsert") {
              indexSync.upsert(entry.material).catch(() => {});
            } else {
              indexSync.remove(entry.id);
            }
          } catch {
            // 索引更新失败不影响主流程
          }
        }
      });
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 素材库 CRUD API
 * GET    /api/materials          — 获取全部素材
 * POST   /api/materials          — upsert 单条素材；若 body 含 ops 数组则走服务端合并
 * DELETE /api/materials?id=xxx   — 删除单条
 *
 * 注意：不提供全表清空接口。
 * 如需批量清理，请在前端逐条删除。
 */

export async function GET() {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const db = getDb();
  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT id, data FROM materials WHERE id LIKE ? ORDER BY updated_at DESC")
    .all(`${prefix}%`) as { id: string; data: string }[];

  // 回退：仅 admin 可触发 unscoped 批量迁移。
  // 高危：此处若允许任意非 admin 用户迁移，会把库内所有遗留的 unscoped 素材
  // （含其他用户/管理员的收藏、预设、提取记录）一次性划入第一个命中此路径的用户名下，
  // 造成跨用户数据窃取 + 原所有者永久数据丢失。
  if (rows.length === 0 && auth.role === "admin") {
    const unscoped = db
      .prepare("SELECT id, data FROM materials WHERE id NOT LIKE 'u:%' ORDER BY updated_at DESC")
      .all() as { id: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newId = prefix + oldRow.id;
        const exists = db.prepare("SELECT 1 FROM materials WHERE id = ?").get(newId);
        if (!exists) {
          db.prepare("UPDATE materials SET id = ? WHERE id = ?").run(newId, oldRow.id);
        }
      }
      rows = unscoped.map((r) => ({ id: prefix + r.id, data: r.data }));
    }
  }

  const materials: unknown[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.data) as Record<string, unknown>;
      materials.push(materialWithUnscopedId(r.id, userId, parsed));
    } catch {
      // 跳过损坏的行，避免整个列表不可用
    }
  }
  return NextResponse.json(materials);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const body = await request.json();

  const indexSync = {
    upsert: upsertMaterialIndex,
    remove: deleteMaterialIndex,
  };

  if (Array.isArray(body?.ops)) {
    const result = handleMaterialsMerge(userId, body.ops as MaterialMergeOp[], indexSync);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "操作失败" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  const { id, ...rest } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }
  if (id.startsWith("u:")) {
    return NextResponse.json(
      { error: "id 包含非法前缀，数据可能已损坏，请重新提交" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const sanitized = { ...body, updatedAt: now };
  const data = JSON.stringify(sanitized);
  const scopedPk = scopeMaterialId(userId, id);

  const db = getDb();
  db.prepare(
    `INSERT INTO materials (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?`
  ).run(scopedPk, data, now, data, now);

  // 同步更新向量索引（静默失败，不影响主流程）
  upsertMaterialIndex(sanitized as Record<string, unknown>).catch(() => {});

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!(auth && "sub" in auth)) return auth as Response;
  const userId = auth.sub;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id 必填，不支持全表清空" }, { status: 400 });
  }
  if (id.startsWith("u:")) {
    return NextResponse.json(
      { error: "id 包含非法前缀" },
      { status: 400 }
    );
  }

  const db = getDb();
  const scopedPk = scopeMaterialId(userId, id);
  const result = db.prepare("DELETE FROM materials WHERE id = ?").run(scopedPk);
  if (result.changes === 0) {
    return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  }
  deleteMaterialIndex(id);
  return NextResponse.json({ success: true });
}
