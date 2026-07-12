/**
 * 素材目录共享模块
 *
 * 合并拆文自动提取 + 用户收藏（SQLite via API）
 * 供 /material 页面和创作工作台 MaterialSidebar 共用。
 */
import type { Material } from "./schema";
import { loadUserMaterials } from "./storage";

/**
 * 加载全部可用素材（用户收藏 + 拆文自动提取，统一存储在 SQLite）
 */
export async function loadAllMaterials(): Promise<Material[]> {
  return loadUserMaterials();
}
