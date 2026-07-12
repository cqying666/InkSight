/**
 * 个人素材库存储层
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/materials API）。
 * 所有函数均为 async，调用方需 await。
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
 * 切换收藏状态
 * @returns 切换后的 favorited 值
 */
export async function toggleFavorite(materialId: string): Promise<boolean> {
  const all = await loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return false;
  const next = !all[idx].favorited;
  all[idx].favorited = next;
  all[idx].updatedAt = new Date().toISOString();
  await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(all[idx]),
  });
  return next;
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
 * 给素材打标签（覆盖式）
 */
export async function setTags(materialId: string, tags: string[]): Promise<void> {
  const all = await loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  const m = all[idx];
  if (m.layer === "atom" && m.atom) m.atom.tags = tags;
  if (m.layer === "component" && m.component) m.component.tags = tags;
  if (m.layer === "inspiration" && m.inspiration) m.inspiration.tags = tags;
  m.updatedAt = new Date().toISOString();
  await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
}

/**
 * 给素材写笔记
 */
export async function setNotes(materialId: string, notes: string): Promise<void> {
  const all = await loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  const m = all[idx];
  if (m.layer === "atom" && m.atom) {
    (m.atom as typeof m.atom & { notes?: string }).notes = notes;
  }
  if (m.layer === "component" && m.component) m.component.notes = notes;
  if (m.layer === "inspiration" && m.inspiration) {
    (m.inspiration as typeof m.inspiration & { notes?: string }).notes = notes;
  }
  m.updatedAt = new Date().toISOString();
  await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
}

/**
 * 给素材分配文件夹
 */
export async function setFolder(
  materialId: string,
  folder: string | undefined
): Promise<void> {
  const all = await loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  all[idx].folder = folder;
  all[idx].updatedAt = new Date().toISOString();
  await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(all[idx]),
  });
}

/**
 * 清空全部用户素材
 */
export async function clearUserMaterials(): Promise<void> {
  await fetch("/api/materials", { method: "DELETE" });
}
