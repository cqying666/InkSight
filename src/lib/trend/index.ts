export {
  Platform,
  LifecycleStage,
  TrendEntry,
  TrendSnapshot,
  HeatmapCell,
  TrendPoint,
  ElementTrend,
  RepresentativeWork,
  CombinationRecommendation,
  validateTrendEntry,
  validateTrendSnapshot,
  computeLifecycle,
  computeDirection,
  PLATFORM_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_ADVICE,
  type PlatformValue,
  type LifecycleStageValue,
  type TrendEntryValue,
  type TrendSnapshotValue,
  type ElementTrendValue,
  type CombinationRecommendationValue,
  type HeatmapCellValue,
  type TrendPointValue,
} from "./schema";

export {
  mockCollectSnapshots,
  mockCollectMultiDay,
  buildElementSeries,
  GENRE_POOL,
  ELEMENT_POOL,
  type MockCollectOptions,
} from "./mock-collector";

export {
  degradeTrendData,
  degradeMaterialSearch,
  buildCollectionStatus,
  type TrendDegradationResult,
  type MaterialSearchResult,
  type CollectionStatus,
} from "./degradation";

// P4-T4 classifier 不从 index 导出，避免 openai SDK 被打包到客户端
// 需要时直接从 "@/lib/trend/classifier" 或 "@/lib/trend/prompts" 导入
// （仅服务端使用：mock-collector 动态 import + API 路由 + tests）
