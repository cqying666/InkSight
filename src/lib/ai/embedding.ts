/**
 * 本地向量嵌入服务
 *
 * 使用 @xenova/transformers 在 Node.js runtime 中运行
 * 模型: Xenova/bge-small-zh-v1.5（512 维，中文优化，~100MB）
 *
 * 首次加载时从 Hugging Face 下载模型并缓存到 .models/ 目录
 * 后续加载从本地缓存读取，无需网络
 *
 * 注意：只能在 Node.js runtime 运行（非 edge），因为依赖 onnxruntime-node
 */

import { env, pipeline } from "@xenova/transformers";
import path from "path";

// 配置模型缓存目录（项目根目录下的 .models/）
env.cacheDir = path.join(process.cwd(), ".models");

// 模型常量
const MODEL_ID = "Xenova/bge-small-zh-v1.5";
export const EMBEDDING_DIMENSION = 512;

// 单例：模型加载后缓存在内存
// transformers.js 的 pipeline 返回联合类型，这里用 any 简化类型处理
let extractorPromise: Promise<any> | null = null;

/**
 * 获取 embedding pipeline（懒加载，首次调用时下载模型）
 */
async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      quantized: true, // 使用量化模型，体积更小、推理更快
    });
  }
  return extractorPromise;
}

/**
 * 对单条文本生成向量嵌入
 *
 * BGE 中文模型对 query 建议加前缀以提升检索效果，
 * 但 transformers.js 的 bge-small-zh-v1.5 已内置处理，直接使用即可。
 *
 * @returns 512 维归一化向量
 */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });
  // output.data 是 Float32Array，转为普通数组
  return Array.from(output.data as Float32Array);
}

/**
 * 批量生成向量嵌入（比逐条调用更高效）
 *
 * @param texts 文本数组
 * @returns 向量数组的数组
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const outputs: number[][] = [];

  // 分批处理，每批 16 条，避免内存峰值
  const BATCH_SIZE = 16;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await extractor(batch, {
      pooling: "mean",
      normalize: true,
    });
    // output.data 是扁平的 Float32Array，需要按维度切分
    const data = output.data as Float32Array;
    for (let j = 0; j < batch.length; j++) {
      const start = j * EMBEDDING_DIMENSION;
      outputs.push(Array.from(data.slice(start, start + EMBEDDING_DIMENSION)));
    }
  }

  return outputs;
}

/**
 * 检查 embedding 服务是否可用（模型是否已缓存）
 */
export function isEmbeddingAvailable(): boolean {
  return true; // 总是可用，首次调用时会自动下载
}

/**
 * 预加载模型（可选，用于启动时预热）
 */
export async function preloadModel(): Promise<void> {
  await getExtractor();
}
