/**
 * 个人素材库本地存储 (P4-T14)
 *
 * 用户收藏 / 自定义标签 / 笔记 / 文件夹分类的持久化层。
 * 真实数据库待 P3-T4 Supabase 配置后接入；当前用 localStorage 实现完整 UX。
 *
 * 存储模型：
 *  - 单一 key 持久化用户已收藏或自编辑的素材条目
 *  - 按 id 索引，相同 id 视为同一条（覆盖 preset/extracted 默认值）
 *  - 失败静默，绝不影响主流程
 *
 * 兼容 schema.ts 的 MaterialSchema，但仅做轻量运行时校验（id/layer/source 必填）
 */

import type { Material } from "./schema";

const USER_MATERIALS_KEY = "inksight:materials:user";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

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

/** 读取全部用户素材（收藏 / 自编辑） */
export function loadUserMaterials(): Material[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(USER_MATERIALS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidMaterial);
  } catch {
    return [];
  }
}

/** 全量覆盖写入（内部用），写后复读确认真实落盘 */
function writeAll(materials: Material[]): boolean {
  if (!isBrowser()) return false;
  try {
    // 上限 500 条，超出丢最旧
    const trimmed = materials.slice(-500);
    const serialized = JSON.stringify(trimmed);
    localStorage.setItem(USER_MATERIALS_KEY, serialized);
    return localStorage.getItem(USER_MATERIALS_KEY) === serialized;
  } catch {
    return false;
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
export function upsertMaterial(
  material: Material,
  options: { preserveUserEdits?: boolean } = {}
): Material | null {
  const all = loadUserMaterials();
  const now = new Date().toISOString();
  const idx = all.findIndex((m) => m.id === material.id);
  const updated: Material = {
    ...(idx >= 0
      ? options.preserveUserEdits
        ? mergeMaterial(all[idx], material)
        : { ...material, createdAt: all[idx].createdAt }
      : material),
    updatedAt: now,
  };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push(updated);
  }
  if (!writeAll(all)) return null;
  return loadUserMaterials().find((item) => item.id === updated.id) ?? null;
}

/**
 * 切换收藏状态
 * @returns 切换后的 favorited 值
 */
export function toggleFavorite(materialId: string): boolean {
  const all = loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return false;
  const next = !all[idx].favorited;
  all[idx].favorited = next;
  all[idx].updatedAt = new Date().toISOString();
  writeAll(all);
  return next;
}

/**
 * 删除单条用户素材
 */
export function removeMaterial(materialId: string): void {
  const all = loadUserMaterials().filter((m) => m.id !== materialId);
  writeAll(all);
}

/**
 * 列出所有自定义文件夹
 */
export function listFolders(): string[] {
  const all = loadUserMaterials();
  const folders = new Set<string>();
  for (const m of all) {
    if (m.folder) folders.add(m.folder);
  }
  return Array.from(folders).sort();
}

/**
 * 给素材打标签（覆盖式）
 */
export function setTags(materialId: string, tags: string[]): void {
  const all = loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  // 按层写到对应内容字段
  const m = all[idx];
  if (m.layer === "atom" && m.atom) m.atom.tags = tags;
  if (m.layer === "component" && m.component) m.component.tags = tags;
  if (m.layer === "inspiration" && m.inspiration) m.inspiration.tags = tags;
  m.updatedAt = new Date().toISOString();
  writeAll(all);
}

/**
 * 给素材写笔记
 */
export function setNotes(materialId: string, notes: string): void {
  const all = loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  const m = all[idx];
  if (m.layer === "atom" && m.atom) {
    // atom 没有独立 notes 字段，写到 component 兜底位置不存在；
    // 用 folder 备存笔记不可行——改用 inspiration.trendElement 风格也不合适。
    // 直接挂到 component.notes（schema 中只有 component 有 notes）
    // 对 atom：在 tags 里加 "note:..." 不优雅；改为存到独立扩展字段
    // 这里采用：atom 也允许 notes（schema 中 atom 没有 notes，运行时附加）
    (m.atom as typeof m.atom & { notes?: string }).notes = notes;
  }
  if (m.layer === "component" && m.component) m.component.notes = notes;
  if (m.layer === "inspiration" && m.inspiration) {
    (m.inspiration as typeof m.inspiration & { notes?: string }).notes = notes;
  }
  m.updatedAt = new Date().toISOString();
  writeAll(all);
}

/**
 * 给素材分配文件夹
 */
export function setFolder(materialId: string, folder: string | undefined): void {
  const all = loadUserMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx < 0) return;
  all[idx].folder = folder;
  all[idx].updatedAt = new Date().toISOString();
  writeAll(all);
}

/**
 * 读取单条用户素材（按 id）
 */
export function getUserMaterial(materialId: string): Material | undefined {
  return loadUserMaterials().find((m) => m.id === materialId);
}

/**
 * 清空全部用户素材（调试用）
 */
export function clearUserMaterials(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(USER_MATERIALS_KEY);
  } catch {
    // ignore
  }
}
