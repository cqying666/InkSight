/**
 * Zvec 向量索引管理
 *
 * 使用 @zvec/zvec（进程内向量数据库）+ 本地 embedding 模型
 * 实现真正的语义检索，替代 TF-IDF 的关键词匹配。
 *
 * 架构：
 *  - 素材文本 → embedding（bge-small-zh-v1.5, 512 维）→ Zvec collection
 *  - 查询文本 → embedding → Zvec 向量搜索 → Top-K 结果
 *  - 索引持久化到 .zvec-data/materials/ 目录
 *  - collection 单例缓存，避免每次 API 调用重新打开
 *
 * 只能在 Node.js runtime 运行（非 edge），因为依赖：
 *  - onnxruntime-node（embedding 推理）
 *  - Zvec native addon（向量索引）
 */

import {
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
} from "@zvec/zvec";
import path from "path";
import { getDb } from "@/lib/db";
import { materialToText } from "./search-tfidf";
import { embed, embedBatch, EMBEDDING_DIMENSION } from "@/lib/ai/embedding";
import type { Material } from "./schema";
import type { SearchResult, SearchOpts } from "./search-tfidf";
import { matchesFilters } from "./search-tfidf";

// ===== 常量 =====

const COLLECTION_PATH = path.join(process.cwd(), ".zvec-data", "materials");
const COLLECTION_NAME = "inksight_materials";
const VECTOR_FIELD = "embedding";

// ===== Collection 单例 =====

// 用 globalThis 持久化，避免 Next.js dev mode 模块热重载时
// singleton 被重置但 Zvec 文件锁仍被旧实例持有
type GlobalWithZvec = typeof globalThis & {
  __zvecRwCollection?: ReturnType<typeof ZVecOpen> | null;
  __zvecRoCollection?: ReturnType<typeof ZVecOpen> | null;
};
const g = globalThis as GlobalWithZvec;

function getRwCollection(): ReturnType<typeof ZVecOpen> | null {
  return g.__zvecRwCollection ?? null;
}
function setRwCollection(c: ReturnType<typeof ZVecOpen> | null): void {
  g.__zvecRwCollection = c;
}
function getRoCollection(): ReturnType<typeof ZVecOpen> | null {
  return g.__zvecRoCollection ?? null;
}
function setRoCollection(c: ReturnType<typeof ZVecOpen> | null): void {
  g.__zvecRoCollection = c;
}

/**
 * 创建 collection schema
 */
function createSchema() {
  return new ZVecCollectionSchema({
    name: COLLECTION_NAME,
    fields: [
      {
        name: "layer",
        dataType: ZVecDataType.STRING,
        indexParams: { indexType: ZVecIndexType.INVERT },
      },
      {
        name: "source",
        dataType: ZVecDataType.STRING,
        indexParams: { indexType: ZVecIndexType.INVERT },
      },
    ],
    vectors: [
      {
        name: VECTOR_FIELD,
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: EMBEDDING_DIMENSION,
        indexParams: {
          indexType: ZVecIndexType.HNSW,
          metricType: ZVecMetricType.COSINE,
        },
      },
    ],
  });
}

/**
 * 获取读写 collection 实例（用于构建/更新索引）
 *
 * 优先打开已有 collection；若不存在则创建新 collection
 */
export function getCollection(): ReturnType<typeof ZVecOpen> {
  const existing = getRwCollection();
  if (existing) return existing;

  const schema = createSchema();
  let collection: ReturnType<typeof ZVecOpen>;
  try {
    collection = ZVecOpen(COLLECTION_PATH, {
      readOnly: false,
      enableMMAP: true,
    });
  } catch {
    collection = ZVecCreateAndOpen(COLLECTION_PATH, schema);
  }
  setRwCollection(collection);
  return collection;
}

/**
 * 获取只读 collection 实例（用于搜索）
 *
 * 只读模式可跨进程共享，不会产生锁冲突
 */
export function getReadonlyCollection(): ReturnType<typeof ZVecOpen> {
  const existing = getRoCollection();
  if (existing) return existing;

  const collection = ZVecOpen(COLLECTION_PATH, {
    readOnly: true,
    enableMMAP: true,
  });
  setRoCollection(collection);
  return collection;
}

// ===== 索引构建 =====

/**
 * 从 SQLite 加载全部素材
 */
function loadMaterialsFromDb(): Material[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT data FROM materials ORDER BY updated_at DESC")
    .all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Material);
}

export interface BuildIndexResult {
  total: number;
  indexed: number;
  skipped: number;
  durationMs: number;
}

/**
 * 构建完整索引（从 SQLite 加载全部素材 → 生成 embedding → 插入 Zvec）
 *
 * 注意：首次构建时会下载 embedding 模型（~100MB），耗时较长
 */
export async function buildIndex(): Promise<BuildIndexResult> {
  const startTime = Date.now();
  const materials = loadMaterialsFromDb();

  if (materials.length === 0) {
    return { total: 0, indexed: 0, skipped: 0, durationMs: 0 };
  }

  const collection = getCollection();

  // 批量生成 embedding
  const texts = materials.map((m) => materialToText(m));
  const validIndices: number[] = [];
  const validTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (texts[i].trim()) {
      validIndices.push(i);
      validTexts.push(texts[i]);
    }
  }

  const embeddings = await embedBatch(validTexts);

  // 插入 Zvec
  let indexed = 0;
  for (let i = 0; i < validIndices.length; i++) {
    const materialIdx = validIndices[i];
    const material = materials[materialIdx];
    try {
      collection.insertSync({
        id: material.id,
        vectors: { [VECTOR_FIELD]: embeddings[i] },
        fields: {
          layer: material.layer,
          source: material.source,
        },
      });
      indexed++;
    } catch {
      // 可能是 id 已存在，尝试 upsert
      try {
        collection.upsertSync({
          id: material.id,
          vectors: { [VECTOR_FIELD]: embeddings[i] },
          fields: {
            layer: material.layer,
            source: material.source,
          },
        });
        indexed++;
      } catch {
        // 跳过失败的
      }
    }
  }

  // 优化索引（构建 HNSW 图）
  collection.optimizeSync();

  return {
    total: materials.length,
    indexed,
    skipped: materials.length - indexed,
    durationMs: Date.now() - startTime,
  };
}

/**
 * 增量更新单条素材的索引
 */
export async function upsertMaterialIndex(material: Material): Promise<void> {
  const text = materialToText(material);
  if (!text.trim()) return;

  const embedding = await embed(text);
  const collection = getCollection();

  try {
    collection.upsertSync({
      id: material.id,
      vectors: { [VECTOR_FIELD]: embedding },
      fields: {
        layer: material.layer,
        source: material.source,
      },
    });
  } catch {
    // 静默失败，不影响主流程
  }
}

/**
 * 从索引中删除单条素材
 */
export function deleteMaterialIndex(materialId: string): void {
  try {
    const collection = getCollection();
    collection.deleteSync(materialId);
  } catch {
    // 静默失败
  }
}

// ===== 向量搜索 =====

/**
 * 向量语义搜索
 *
 * @param query 查询文本
 * @param opts 搜索选项（topN、筛选条件）
 * @returns 搜索结果（含素材对象和相似度分数）
 */
export async function searchVector(
  query: string,
  opts?: SearchOpts
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const topN = opts?.topN ?? 20;
  // 多取一些候选，再用筛选条件过滤
  const candidateK = Math.min(topN * 3, 50);

  // 生成 query embedding
  const queryVector = await embed(query);

  const collection = getReadonlyCollection();
  const results = collection.querySync({
    fieldName: VECTOR_FIELD,
    vector: queryVector,
    topk: candidateK,
  }) as Array<{ id: string; score: number; fields: Record<string, unknown> }>;

  if (!results || results.length === 0) return [];

  // 从 SQLite 加载素材详情（Zvec 只存了 id + 少量标量字段）
  const db = getDb();
  const ids = results.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, data FROM materials WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; data: string }[];

  const materialMap = new Map<string, Material>();
  for (const row of rows) {
    try {
      materialMap.set(row.id, JSON.parse(row.data) as Material);
    } catch {
      // 跳过解析失败
    }
  }

  // 组合结果并应用筛选
  const searchResults: SearchResult[] = [];
  for (const result of results) {
    const material = materialMap.get(result.id);
    if (!material) continue;
    if (!matchesFilters(material, opts)) continue;
    searchResults.push({ material, score: result.score });
    if (searchResults.length >= topN) break;
  }

  return searchResults;
}

/**
 * 检查 Zvec 索引是否已就绪（collection 是否可打开）
 */
export function isIndexReady(): boolean {
  try {
    getCollection();
    return true;
  } catch {
    return false;
  }
}

/**
 * 销毁索引（重置内存状态，磁盘数据由调用方处理）
 */
export function destroyIndex(): void {
  setRwCollection(null);
  setRoCollection(null);
}
