export {
  MaterialSchema,
  MaterialLayer,
  MaterialSource,
  ComponentKind,
  AtomContent,
  ComponentContent,
  InspirationContent,
  MaterialOrigin,
  validateMaterial,
  LAYER_LABEL,
  SOURCE_LABEL,
  COMPONENT_KIND_LABEL,
  type Material,
  type MaterialLayerValue,
  type MaterialSourceValue,
  type ComponentKindValue,
  type AtomContentValue,
  type ComponentContentValue,
  type InspirationContentValue,
  type MaterialOriginValue,
} from "./schema";

export {
  extractMaterialsFromTeardown,
  validateExtractedMaterials,
  type ExtractOptions,
} from "./extractor";

export {
  buildIndex,
  search,
  keywordFallback,
  matchesFilters,
  listFilterValues,
  NOVEL_TYPE_LABEL,
  EMOTION_SHAPES,
  type SearchResult,
  type SearchOpts,
} from "./search-tfidf";

export {
  loadUserMaterials,
  upsertMaterial,
  toggleFavorite,
  removeMaterial,
  listFolders,
  setTags,
  setNotes,
  setFolder,
  getUserMaterial,
  clearUserMaterials,
} from "./storage";

export {
  loadAllMaterials,
} from "./catalog";

export {
  buildAnalysisMaterialCandidates,
  createManualMaterial,
  materialToCoachText,
  type AnalysisMaterialCandidate,
  type MaterialCategory,
} from "./from-analysis";
