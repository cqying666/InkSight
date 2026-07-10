import { type TrendSnapshotValue, type PlatformValue } from "./schema";
import { type Material } from "../material/schema";
import {
  type SearchResult,
  type SearchOpts,
  keywordFallback,
} from "../material/search-tfidf";

/**
 * 趋势 + 素材降级机制 (P4-T16)
 *
 * 覆盖 PRD §6.3 三类降级：
 *
 * 1. 趋势 - 采集失败：
 *    → 展示最近一次成功数据 + 标注"数据更新于 N 小时前"
 *
 * 2. 趋势 - 某平台不可用：
 *    → 隐藏该列（前端不展示该平台）
 *
 * 3. 素材 - 语义搜索超时 / 无结果：
 *    → 降级关键词搜索
 *    → 仍无结果提示"搜索超时,请尝试更具体的关键词"
 */

// ===== 趋势降级 =====

export interface TrendDegradationResult {
  /** 实际可展示的快照（可能来自降级数据） */
  snapshots: TrendSnapshotValue[];
  /** 降级提示文案（无降级时为 null） */
  notice: string | null;
  /** 可用平台列表（不可用平台已剔除） */
  availablePlatforms: PlatformValue[];
  /** 数据源标记 */
  source: "real" | "mock" | "stale";
}

/**
 * 趋势数据降级处理
 *
 * @param freshSnapshots 当日采集的快照（可能为空 / 部分平台缺失）
 * @param lastSuccessSnapshots 上一次成功采集的快照（缓存）
 * @param failedPlatforms 本次采集失败的平台列表
 */
export function degradeTrendData(
  freshSnapshots: TrendSnapshotValue[],
  lastSuccessSnapshots: TrendSnapshotValue[],
  failedPlatforms: PlatformValue[] = []
): TrendDegradationResult {
  const failedSet = new Set(failedPlatforms);

  // 1. 当日有数据：剔除失败平台，返回 fresh
  if (freshSnapshots.length > 0) {
    const usable = freshSnapshots.filter((s) => !failedSet.has(s.platform));
    if (usable.length > 0) {
      const notice =
        failedPlatforms.length > 0
          ? `${failedPlatforms.length} 个平台暂不可用，已隐藏`
          : null;
      return {
        snapshots: usable,
        notice,
        availablePlatforms: usable.map((s) => s.platform),
        source: usable[0].source,
      };
    }
  }

  // 2. 当日无数据：降级到上次成功数据
  if (lastSuccessSnapshots.length > 0) {
    const usable = lastSuccessSnapshots.filter(
      (s) => !failedSet.has(s.platform)
    );
    const lastDate = usable[0]?.date || "未知";
    const hoursAgo = computeHoursAgo(usable[0]?.collectedAt);
    const notice = `数据更新于 ${hoursAgo} 小时前（${lastDate}）`;
    return {
      snapshots: usable,
      notice,
      availablePlatforms: usable.map((s) => s.platform),
      source: "stale",
    };
  }

  // 3. 完全无数据
  return {
    snapshots: [],
    notice: "趋势数据暂不可用，请稍后再试",
    availablePlatforms: [],
    source: "stale",
  };
}

/**
 * 计算距现在的小时数
 */
function computeHoursAgo(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 3600000));
}

// ===== 素材搜索降级 =====

export interface MaterialSearchResult {
  results: SearchResult[];
  /** 降级标记：tfidf=正常 / keyword=关键词降级 / empty=无结果 */
  mode: "tfidf" | "keyword" | "empty";
  /** 提示文案 */
  notice: string | null;
}

/**
 * 素材搜索降级链路（PRD §6.3）
 *
 * 1. 先用 TF-IDF 语义搜索（外部传入）
 * 2. 无结果 → 降级关键词搜索
 * 3. 仍无结果 → 提示"搜索超时,请尝试更具体的关键词"
 *
 * @param tfidfResults TF-IDF 搜索结果（外部计算，便于复用索引）
 * @param materials 全量素材（关键词降级用）
 * @param query 原始查询
 */
export function degradeMaterialSearch(
  tfidfResults: SearchResult[],
  materials: Material[],
  query: string,
  opts?: SearchOpts
): MaterialSearchResult {
  // 1. TF-IDF 有结果
  if (tfidfResults.length > 0) {
    return {
      results: tfidfResults,
      mode: "tfidf",
      notice: null,
    };
  }

  // 2. 降级关键词搜索
  const keywordResults = keywordFallback(materials, query, opts);
  if (keywordResults.length > 0) {
    return {
      results: keywordResults,
      mode: "keyword",
      notice: "语义搜索无结果，已降级为关键词搜索",
    };
  }

  // 3. 完全无结果
  return {
    results: [],
    mode: "empty",
    notice: "搜索超时，请尝试更具体的关键词",
  };
}

// ===== 采集失败标记 =====

/**
 * 采集状态标记（供前端展示降级提示用）
 */
export interface CollectionStatus {
  /** 采集时间 */
  collectedAt: string;
  /** 采集状态 */
  status: "success" | "partial" | "failed" | "stale";
  /** 失败平台 */
  failedPlatforms: PlatformValue[];
  /** 降级提示 */
  notice: string | null;
}

export function buildCollectionStatus(
  snapshots: TrendSnapshotValue[],
  failedPlatforms: PlatformValue[] = [],
  isStale = false
): CollectionStatus {
  if (isStale) {
    const hoursAgo = computeHoursAgo(snapshots[0]?.collectedAt);
    return {
      collectedAt: snapshots[0]?.collectedAt || new Date().toISOString(),
      status: "stale",
      failedPlatforms,
      notice: `数据更新于 ${hoursAgo} 小时前`,
    };
  }

  if (snapshots.length === 0) {
    return {
      collectedAt: new Date().toISOString(),
      status: "failed",
      failedPlatforms,
      notice: "趋势数据采集失败，请稍后再试",
    };
  }

  if (failedPlatforms.length > 0) {
    return {
      collectedAt: snapshots[0].collectedAt,
      status: "partial",
      failedPlatforms,
      notice: `${failedPlatforms.length} 个平台暂不可用，已隐藏`,
    };
  }

  return {
    collectedAt: snapshots[0].collectedAt,
    status: "success",
    failedPlatforms: [],
    notice: null,
  };
}
