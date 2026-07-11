/**
 * 素材目录共享模块 (P5-T6/T7/T8 共用)
 *
 * 合并拆文自动提取 + 用户收藏（localStorage）
 * 供 /material 页面和创作工作台 MaterialSidebar 共用，避免重复实现。
 */
import type { Material } from "./schema";
import { loadUserMaterials, upsertMaterial } from "./storage";

const TREND_SAVED_KEY = "inksight:materials:trend-saved";

/**
 * 加载全部可用素材（拆文提取 + 用户收藏 + 趋势收藏迁移）
 *
 * 合并规则：用户编辑覆盖同 id 的 extracted，用户独立收藏追加
 */
export function loadAllMaterials(): Material[] {
  // 用户收藏 / 自编辑素材 / 拆文自动提取素材（已统一持久化到 user store）
  const userSaved = loadUserMaterials();

  // 趋势页一键收藏的素材（独立 key，迁移到 user store 后清空）
  try {
    const trendRaw = localStorage.getItem(TREND_SAVED_KEY);
    if (trendRaw) {
      const trendMats = JSON.parse(trendRaw) as Material[];
      if (Array.isArray(trendMats)) {
        for (const m of trendMats) {
          if (!userSaved.find((x) => x.id === m.id)) {
            upsertMaterial(m);
          }
        }
        localStorage.removeItem(TREND_SAVED_KEY);
        return loadUserMaterials();
      }
    }
  } catch {
    // ignore
  }

  return userSaved;
}
