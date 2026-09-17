/**
 * 个人素材库存储层
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/materials API）。
 * 所有函数均为 async，调用方需 await。
 *
 * P4-T15 修复：toggleFavorite / setTags / setNotes / setFolder
 * 改用服务端合并操作（POST /api/materials body.ops），消除
 * 客户端读-改-写竞态导致的数据丢失。
 */

import type { Material } from "./schema";

/** 轻量校验：仅检查必备字段 */
function isValidMaterial(m: unknown): m is Material {
  if (!m || typeof m !== "object") return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.layer === "string" &&
    typeof obj.source === "string" &&
    (obj.layer === "atom" || obj.layer === "component" || obj.layer === "inspiration")
  );
}

/** 读取全部用户素材 */
export async function loadUserMaterials(): Promise<Material[]> {
  try {
    const res = await fetch("/api/materials");
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidMaterial);
  } catch {
    return [];
  }
}

/** 读取单条用户素材（按 id） */
export async function getUserMaterial(
  materialId: string
): Promise<Material | undefined> {
  const all = await loadUserMaterials();
  return all.find((m) => m.id === materialId);
}

/** 发送合并操作到服务端 */
async function postMaterialOps(
  ops: Array<Record<string, unknown>>
): Promise<void> {
  const res = await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `操作失败 (${res.status})`);
  }
}

function mergeTags(existing: string[] = [], incoming: string[] = []): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergeMaterial(existing: Material, incoming: Material): Material {
  const merged: Material = {
    ...incoming,
    createdAt: existing.createdAt,
    folder: incoming.folder ?? existing.folder,
  };

  if (existing.atom && incoming.atom) {
    merged.atom = {
      ...incoming.atom,
      ...(("notes" in existing.atom && typeof existing.atom.notes === "string")
        ? { notes: existing.atom.notes }
        : {}),
      tags: mergeTags(existing.atom.tags, incoming.atom.tags),
    } as typeof incoming.atom;
  }
  if (existing.component && incoming.component) {
    merged.component = {
      ...incoming.component,
      notes: existing.component.notes ?? incoming.component.notes,
      tags: mergeTags(existing.component.tags, incoming.component.tags),
    };
  }
  if (existing.inspiration && incoming.inspiration) {
    merged.inspiration = {
      ...incoming.inspiration,
      ...(("notes" in existing.inspiration &&
      typeof existing.inspiration.notes === "string")
        ? { notes: existing.inspiration.notes }
        : {}),
      tags: mergeTags(existing.inspiration.tags, incoming.inspiration.tags),
    } as typeof incoming.inspiration;
  }
  return merged;
}

/**
 * 保存或更新单条素材（按 id upsert）
 * @returns 写入后的素材；失败时返回 null
 */
export async function upsertMaterial(
  material: Material,
  options: { preserveUserEdits?: boolean } = {}
): Promise<Material | null> {
  let toSave = material;
  if (options.preserveUserEdits) {
    const existing = await getUserMaterial(material.id);
    if (existing) {
      toSave = mergeMaterial(existing, material);
    }
  }
  const updatedAt = new Date().toISOString();
  const payload = { ...toSave, updatedAt };
  try {
    const res = await fetch("/api/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 切换收藏状态（单请求原子操作，消除竞态）。
 *
 * 行为：
 *  - 素材已在用户库：服务端事务内原地翻转 favorited。
 *  - 素材尚未入库（预设 / 提取态首次收藏）：仅当传入 `fallback` 快照时，
 *    在同一事务里插入一条 favorited=true 的副本。
 *
 *  这保证绝无可能出现「先 upsert 未收藏副本 + toggleFavorite 失败」的中间态，
 *  即不会把用户从未主动保存过的预设素材残留在用户库里。
 *
 * @returns 操作是否成功
 */
export async function toggleFavorite(
  materialId: string,
  fallback?: Material
): Promise<boolean> {
  try {
    await postMaterialOps([
      fallback
        ? { op: "toggleFavorite", id: materialId, fallback }
        : { op: "toggleFavorite", id: materialId },
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除单条用户素材
 */
export async function removeMaterial(materialId: string): Promise<void> {
  await fetch(`/api/materials?id=${encodeURIComponent(materialId)}`, {
    method: "DELETE",
  });
}

/**
 * 列出所有自定义文件夹（从已加载素材计算）
 */
export function listFolders(materials: Material[]): string[] {
  const folders = new Set<string>();
  for (const m of materials) {
    if (m.folder) folders.add(m.folder);
  }
  return Array.from(folders).sort();
}

/**
 * 给素材打标签（覆盖式，服务端合并，消除竞态）
 */
export async function setTags(materialId: string, tags: string[]): Promise<void> {
  await postMaterialOps([{ op: "setTags", id: materialId, tags }]);
}

/**
 * 给素材写笔记（服务端合并，消除竞态）
 */
export async function setNotes(materialId: string, notes: string): Promise<void> {
  await postMaterialOps([{ op: "setNotes", id: materialId, notes }]);
}

/**
 * 给素材分配文件夹（服务端合并，消除竞态）
 */
export async function setFolder(
  materialId: string,
  folder: string | undefined
): Promise<void> {
  await postMaterialOps([{ op: "setFolder", id: materialId, folder }]);
}

/**
 * 清空全部用户素材（逐条删除，避免全表清空接口）
 */
export async function clearUserMaterials(): Promise<void> {
  const all = await loadUserMaterials();
  for (const m of all) {
    await removeMaterial(m.id);
  }
}
