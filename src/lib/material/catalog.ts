/**
 * 素材目录共享模块 (P5-T6/T7/T8 共用)
 *
 * 合并预置素材 + 拆文自动提取 + 用户收藏（localStorage）
 * 供 /material 页面和创作工作台 MaterialSidebar 共用，避免重复实现。
 */
import type { Material } from "./schema";
import { loadUserMaterials, upsertMaterial } from "./storage";

const TREND_SAVED_KEY = "inksight:materials:trend-saved";

/** 预置素材（演示三层结构） */
export function buildPresetMaterials(): Material[] {
  const now = new Date().toISOString();
  return [
    {
      id: "preset-atom-1",
      layer: "atom",
      source: "preset",
      createdAt: now,
      updatedAt: now,
      userId: "anonymous",
      favorited: false,
      atom: {
        text: "他笑起来的样子，像冬天里最后一缕阳光",
        tags: ["比喻", "温暖"],
      },
    },
    {
      id: "preset-atom-2",
      layer: "atom",
      source: "preset",
      createdAt: now,
      updatedAt: now,
      userId: "anonymous",
      favorited: false,
      atom: {
        text: "她关上门的瞬间，整个世界安静了下来，只剩下钟摆的滴答声",
        tags: ["场景", "寂静"],
      },
    },
    {
      id: "preset-inspiration-1",
      layer: "inspiration",
      source: "preset",
      createdAt: now,
      updatedAt: now,
      userId: "anonymous",
      favorited: false,
      inspiration: {
        title: "悬疑节奏的音乐转译",
        text: "如果把悬疑小说的节奏映射成音乐，快板=高事件密度，慢板=情感铺垫，休止符=反转前的沉默",
        kind: "av_transcription",
        tags: ["悬疑", "音乐", "节奏"],
      },
    },
    {
      id: "preset-inspiration-2",
      layer: "inspiration",
      source: "preset",
      createdAt: now,
      updatedAt: now,
      userId: "anonymous",
      favorited: false,
      inspiration: {
        title: "如果记忆可以交易",
        text: "如果记忆可以交易，穷人会卖掉痛苦的记忆，富人会购买别人的幸福瞬间——这会催生什么样的故事？",
        kind: "what_if",
        tags: ["科幻", "记忆", "假设"],
      },
    },
  ];
}

/**
 * 加载全部可用素材（preset + 拆文提取 + 用户收藏 + 趋势收藏迁移）
 *
 * 合并规则：用户编辑覆盖同 id 的 preset/extracted，用户独立收藏追加
 */
export function loadAllMaterials(): Material[] {
  const preset = buildPresetMaterials();
  const extracted: Material[] = [];

  // 用户收藏 / 自编辑素材（覆盖同 id 的 preset/extracted）
  const userSaved = loadUserMaterials();
  const userMap = new Map(userSaved.map((m) => [m.id, m]));

  // 趋势页一键收藏的素材（独立 key，迁移到 user store 后清空）
  try {
    const trendRaw = localStorage.getItem(TREND_SAVED_KEY);
    if (trendRaw) {
      const trendMats = JSON.parse(trendRaw) as Material[];
      if (Array.isArray(trendMats)) {
        for (const m of trendMats) {
          if (!userMap.has(m.id)) {
            userMap.set(m.id, m);
            upsertMaterial(m);
          }
        }
        localStorage.removeItem(TREND_SAVED_KEY);
      }
    }
  } catch {
    // ignore
  }

  // 合并：preset/extracted 作为基础，userSaved 覆盖同 id
  const merged: Material[] = [];
  const seenIds = new Set<string>();
  for (const m of [...preset, ...extracted]) {
    const overridden = userMap.get(m.id);
    merged.push(overridden ?? m);
    seenIds.add(m.id);
  }
  // 用户独立收藏的（不在 preset/extracted 中）追加
  for (const m of userSaved) {
    if (!seenIds.has(m.id)) {
      merged.push(m);
      seenIds.add(m.id);
    }
  }

  return merged;
}
