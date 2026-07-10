import {
  type TrendEntryValue,
  type TrendSnapshotValue,
  type PlatformValue,
  type HeatmapCellValue,
} from "./schema";
import { validateTrendSnapshot } from "./schema";
import { GENRE_POOL, ELEMENT_POOL } from "./labels";

// 注意：classifier.ts 通过动态 import 加载，避免 openai SDK 被打包到客户端
// （同步 mock 路径不需要 LLM，只有 useLLMClassification=true 时才加载）

/**
 * Mock 榜单采集器 (P4-T1 mock 版)
 *
 * 真实采集器需对接各平台爬虫（待 P4-T2 合规评估后实现）；
 * 当前用 mock fixture 跑通 P4-T3 数据模型 → P4-T5 前端 → P4-T16 降级 全链路。
 *
 * 合规约束（工程约束 §1.2）：
 *  - 仅采集公开榜单元数据（标题/作者/平台/热度/排名）
 *  - 不采集付费内容正文
 *  - 不存储单篇完整内容
 *
 * Mock 策略：
 *  - 4 平台 × 每平台 10-15 条榜单条目
 *  - 题材/元素标签：
 *    - 默认（useLLMClassification=false）：从预置词表随机组合（保持 mock 可复现）
 *    - 开启 useLLMClassification=true：先生成 mock 标题，再调 LLM 分类填 genres/elements
 *      （P4-T4，需配置 LLM_API_KEY；失败时降级规则版字面匹配）
 *  - 热度值用 LCG PRNG 可复现（与 synthetic-seeds 一致风格）
 *  - 生成单日快照，可指定 date
 */

// ===== 题材与元素词表（从 labels.ts 导入，避免循环依赖） =====

// 重新导出，保持向后兼容（外部模块从 mock-collector 导入 GENRE_POOL/ELEMENT_POOL 仍可用）
export { GENRE_POOL, ELEMENT_POOL } from "./labels";

const TITLE_TEMPLATES = [
  "{genre}之夜",
  "{genre}故事集",
  "{element}法则",
  "{genre}×{element}",
  "当{genre}遇见{element}",
  "{element}指南",
  "{genre}档案",
  "最后的{element}",
  "{genre}日记",
  "{element}边缘",
];

const AUTHOR_POOL = [
  "墨白",
  "青衣",
  "夜归",
  "拾光",
  "砚池",
  "听雪",
  "南风",
  "北辰",
  "半夏",
  "深秋",
];

// ===== LCG PRNG（可复现） =====

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

// ===== 单平台 mock 采集 =====

/**
 * 生成单平台 mock 榜单条目
 *
 * @param useLLMClassification 是否走 LLM 分类（P4-T4）：
 *   - false（默认）：随机词表填 genres/elements（mock 可复现）
 *   - true：先用词表生成标题，再用 LLM 分类填 genres/elements（异步）
 */
function generatePlatformEntries(
  platform: PlatformValue,
  date: string,
  count: number,
  seed: number
): TrendEntryValue[] {
  const rng = makeRng(seed);
  const entries: TrendEntryValue[] = [];

  for (let i = 0; i < count; i++) {
    const genre1 = pick(rng, GENRE_POOL);
    const genre2 = pick(rng, GENRE_POOL);
    const elem1 = pick(rng, ELEMENT_POOL);
    const elem2 = pick(rng, ELEMENT_POOL);
    const titleTpl = pick(rng, TITLE_TEMPLATES);

    const title = titleTpl
      .replace("{genre}", genre1)
      .replace("{element}", elem1);

    entries.push({
      title,
      author: pick(rng, AUTHOR_POOL),
      platform,
      rank: i + 1,
      rankChange: Math.floor(rng() * 7) - 3, // -3 ~ +3
      genres: Array.from(new Set([genre1, genre2])),
      elements: Array.from(new Set([elem1, elem2])),
      popularity: Math.floor(rng() * 90000) + 10000, // 1w ~ 10w
      collectedAt: date,
    });
  }

  return entries;
}

/**
 * 生成单平台 mock 榜单条目（LLM 分类版，标题不带占位符填充，让 LLM 自己推断）
 *
 * 注意：为避免 LLM 看到模板化标题（"{genre}之夜"）导致字面匹配过强、
 * 无法评估真实分类能力，这里改用更"自然"的标题模板。
 */
function generatePlatformEntriesForLLM(
  platform: PlatformValue,
  date: string,
  count: number,
  seed: number
): TrendEntryValue[] {
  const rng = makeRng(seed);
  const entries: TrendEntryValue[] = [];

  // LLM 评估版标题模板（更自然，不强占位）
  const NATURAL_TITLE_TEMPLATES = [
    "深夜便利店",
    "第三种结局",
    "她来时有星光",
    "旧巷深处",
    "最后一班地铁",
    "记忆当铺",
    "雨夜来信",
    "逆光的秋天",
    "凌晨三点的电话",
    "消失的第十一天",
    "隔壁的钢琴声",
    "礼物",
    "海边的房间",
    "回不去的夏天",
    "镜中人",
    "飞鸟与鱼",
    "落雪无声",
    "空座位",
    "钥匙",
    "归途",
  ];

  for (let i = 0; i < count; i++) {
    const title = pick(rng, NATURAL_TITLE_TEMPLATES);

    entries.push({
      title,
      author: pick(rng, AUTHOR_POOL),
      platform,
      rank: i + 1,
      rankChange: Math.floor(rng() * 7) - 3,
      // genres/elements 留空，由 LLM 填充
      genres: [],
      elements: [],
      popularity: Math.floor(rng() * 90000) + 10000,
      collectedAt: date,
    });
  }

  return entries;
}

// ===== 聚合为热力图 =====

function aggregateHeatmap(entries: TrendEntryValue[]): {
  heatmap: HeatmapCellValue[];
  genres: string[];
  elements: string[];
} {
  const cellMap = new Map<string, HeatmapCellValue>();
  const genreSet = new Set<string>();
  const elementSet = new Set<string>();

  for (const e of entries) {
    for (const g of e.genres) {
      genreSet.add(g);
      for (const el of e.elements) {
        elementSet.add(el);
        const key = `${g}|${el}`;
        const cell = cellMap.get(key);
        if (cell) {
          cell.heat += e.popularity;
          cell.count += 1;
        } else {
          cellMap.set(key, { genre: g, element: el, heat: e.popularity, count: 1 });
        }
      }
    }
  }

  return {
    heatmap: Array.from(cellMap.values()).sort((a, b) => b.heat - a.heat),
    genres: Array.from(genreSet).sort(),
    elements: Array.from(elementSet).sort(),
  };
}

// ===== 主入口 =====

export interface MockCollectOptions {
  /** 采集日期 ISO（YYYY-MM-DD），默认今天 */
  date?: string;
  /** 每平台条目数，默认 12 */
  entriesPerPlatform?: number;
  /** 随机种子，默认 42（可复现） */
  seed?: number;
  /** 平台列表，默认全部 4 个 */
  platforms?: PlatformValue[];
  /**
   * 是否走 LLM 标签分类（P4-T4）
   *  - false（默认）：词表随机组合（mock 可复现，无需 LLM_API_KEY）
   *  - true：用更自然的标题模板，调 LLM 分类填 genres/elements
   *    （需配置 LLM_API_KEY；失败降级规则版字面匹配）
   *
   * 注意：开启后 mockCollectSnapshots 变成异步函数
   */
  useLLMClassification?: boolean;
}

/**
 * 生成单日 mock 趋势快照（4 平台合并）
 *
 * 同步版（默认，词表随机）：mockCollectSnapshots(opts)
 * 异步版（开启 LLM 分类）：await mockCollectSnapshots({ useLLMClassification: true })
 *
 * 通过函数重载让 TypeScript 正确推断返回类型：
 *  - 不传 useLLMClassification 或传 false → 同步 TrendSnapshotValue[]
 *  - 传 useLLMClassification: true → 异步 Promise<TrendSnapshotValue[]>
 */
export function mockCollectSnapshots(
  opts?: MockCollectOptions & { useLLMClassification?: false }
): TrendSnapshotValue[];
export function mockCollectSnapshots(
  opts: MockCollectOptions & { useLLMClassification: true }
): Promise<TrendSnapshotValue[]>;
export function mockCollectSnapshots(
  opts: MockCollectOptions = {}
): TrendSnapshotValue[] | Promise<TrendSnapshotValue[]> {
  // 同步路径：词表随机（默认）
  if (!opts.useLLMClassification) {
    return mockCollectSnapshotsSync(opts);
  }

  // 异步路径：LLM 分类
  return mockCollectSnapshotsWithLLM(opts);
}

/**
 * 同步版：词表随机标签（保持向后兼容）
 */
function mockCollectSnapshotsSync(
  opts: MockCollectOptions
): TrendSnapshotValue[] {
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const count = opts.entriesPerPlatform ?? 12;
  const baseSeed = opts.seed ?? 42;
  const platforms = opts.platforms || (["fanqie", "zhihu", "qimao", "dianzhong"] as PlatformValue[]);

  const snapshots: TrendSnapshotValue[] = [];

  platforms.forEach((platform, idx) => {
    const entries = generatePlatformEntries(
      platform,
      date,
      count,
      baseSeed + idx * 1000
    );
    const { heatmap, genres, elements } = aggregateHeatmap(entries);

    const snapshot: TrendSnapshotValue = {
      id: `${platform}-${date}`,
      platform,
      date,
      entries,
      heatmap,
      genres,
      elements,
      collectedAt: new Date().toISOString(),
      source: "mock",
    };

    const validation = validateTrendSnapshot(snapshot);
    if (!validation.success) {
      throw new Error(
        `mock 快照 ${platform} 校验失败: ${validation.errors?.join("; ")}`
      );
    }

    snapshots.push(snapshot);
  });

  return snapshots;
}

/**
 * 异步版：LLM 标签分类（P4-T4）
 *
 * 流程：
 *  1. 用自然标题模板生成 entries（genres/elements 留空）
 *  2. 动态 import classifier（避免 openai SDK 打包到客户端）
 *  3. 调 classifyEntries 批量分类（LLM + 规则版降级）
 *  4. 把分类结果填回 entries
 *  5. 聚合成快照
 */
async function mockCollectSnapshotsWithLLM(
  opts: MockCollectOptions
): Promise<TrendSnapshotValue[]> {
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const count = opts.entriesPerPlatform ?? 12;
  const baseSeed = opts.seed ?? 42;
  const platforms = opts.platforms || (["fanqie", "zhihu", "qimao", "dianzhong"] as PlatformValue[]);

  // 动态 import classifier（仅 LLM 路径加载，避免 openai SDK 进客户端 bundle）
  const { classifyEntries, ruleClassify } = await import("./classifier");

  // 1. 生成所有平台的 entries（自然标题，标签留空）
  const allEntries: { platform: PlatformValue; entries: TrendEntryValue[] }[] = [];
  for (let idx = 0; idx < platforms.length; idx++) {
    const platform = platforms[idx];
    const entries = generatePlatformEntriesForLLM(
      platform,
      date,
      count,
      baseSeed + idx * 1000
    );
    allEntries.push({ platform, entries });
  }

  // 2. 收集所有 entries 一次性批量分类（降低 API 调用次数）
  const flatEntries = allEntries.flatMap((x) => x.entries);
  const classifications = await classifyEntries(flatEntries);

  // 3. 把分类结果填回 entries（按顺序对应）
  let clsIdx = 0;
  for (const { platform, entries } of allEntries) {
    for (const entry of entries) {
      const cls = classifications[clsIdx++];
      if (cls) {
        entry.genres = cls.genres;
        entry.elements = cls.elements;
      } else {
        // 兜底：规则版
        const fallback = ruleClassify(entry);
        entry.genres = fallback.genres;
        entry.elements = fallback.elements;
      }
    }
  }

  // 4. 聚合成快照
  const snapshots: TrendSnapshotValue[] = [];
  for (const { platform, entries } of allEntries) {
    const { heatmap, genres, elements } = aggregateHeatmap(entries);

    const snapshot: TrendSnapshotValue = {
      id: `${platform}-${date}`,
      platform,
      date,
      entries,
      heatmap,
      genres,
      elements,
      collectedAt: new Date().toISOString(),
      source: "mock", // 数据本身是 mock，标签是 LLM 增强但仍属 mock 范畴
    };

    const validation = validateTrendSnapshot(snapshot);
    if (!validation.success) {
      throw new Error(
        `mock 快照 ${platform} 校验失败: ${validation.errors?.join("; ")}`
      );
    }

    snapshots.push(snapshot);
  }

  return snapshots;
}

/**
 * 生成多日 mock 趋势快照（用于时间序列 / 生命周期标注）
 *
 * 注意：多日 + LLM 分类成本过高（30 天 × 4 平台 × 12 条 ≈ 72 次 LLM 调用），
 * 因此 mockCollectMultiDay 仅支持同步词表随机模式。
 * 如需 LLM 分类，请对单日调用 mockCollectSnapshots({ useLLMClassification: true })。
 *
 * @param days 天数（从今天往前推）
 */
export function mockCollectMultiDay(
  days: number,
  opts: Omit<MockCollectOptions, "date" | "useLLMClassification"> = {}
): TrendSnapshotValue[] {
  const all: TrendSnapshotValue[] = [];
  const today = new Date();

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    const snapshots = mockCollectSnapshots({
      ...opts,
      date: dateStr,
      // 每天种子微调，保证数据有波动
      seed: (opts.seed ?? 42) + d * 7,
    });
    all.push(...snapshots);
  }

  return all;
}

/**
 * 从快照集合中提取某题材/元素的时间序列（用于 P4-T6 生命周期）
 */
export function buildElementSeries(
  snapshots: TrendSnapshotValue[],
  name: string,
  kind: "genre" | "element"
): { date: string; heat: number; count: number }[] {
  const series: { date: string; heat: number; count: number }[] = [];

  // 按 date 升序
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  for (const snap of sorted) {
    let heat = 0;
    let count = 0;
    for (const cell of snap.heatmap) {
      const match =
        (kind === "genre" && cell.genre === name) ||
        (kind === "element" && cell.element === name);
      if (match) {
        heat += cell.heat;
        count += cell.count;
      }
    }
    series.push({ date: snap.date, heat, count });
  }

  return series;
}
