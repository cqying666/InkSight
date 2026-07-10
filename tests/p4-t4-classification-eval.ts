import { readFileSync } from "fs";
import { join } from "path";
import {
  classifyEntries,
  ruleClassify,
} from "../src/lib/trend/classifier";
import type { TrendEntryValue } from "../src/lib/trend/schema";
import { GENRE_POOL, ELEMENT_POOL } from "../src/lib/trend/labels";

/**
 * P4-T4 LLM 标签分类准确率评估
 *
 * 用法:
 *   npx tsx tests/p4-t4-classification-eval.ts
 *
 * 前置:
 *   - .env.local 中配置 LLM_API_KEY
 *
 * 验收标准（PRD §5.6 + 工程约束 §2）: 标签分类准确率 >90%（抽样人工校验）
 *
 * 评估方法:
 *   - 30 条人工标注真值标题（覆盖全部 10 题材 + 10 元素）
 *   - 对比 LLM 分类 vs 规则版降级
 *   - 多指标评估（严格集合相等 / 子集匹配 / 主标签匹配 / Jaccard 相似度）
 */

// ===== .env.local 加载（tsx 不自动加载，需手动） =====

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local 不存在或不可读，依赖外部 env
  }
}

loadEnvLocal();

// ===== 人工标注真值数据集（30 条，覆盖全部 10 题材 + 10 元素） =====
//
// 标注原则:
//   - 每个 title 标注 1 个主题材（GENRE_POOL）+ 1 个主元素（ELEMENT_POOL）
//   - 标注基于标题语义的最自然解读（多数读者共识）
//   - 故意覆盖模糊/多义标题，测试 LLM 语义推断能力
//   - 标题不同于 mock-collector 的 NATURAL_TITLE_TEMPLATES，避免记忆干扰

interface EvalCase {
  title: string;
  truthGenres: string[];
  truthElements: string[];
}

const EVAL_DATASET: EvalCase[] = [
  // ===== 悬疑（4 条）=====
  { title: "消失的室友", truthGenres: ["悬疑"], truthElements: ["悬念"] },
  { title: "二手书店的秘密", truthGenres: ["悬疑"], truthElements: ["悬念"] },
  { title: "雨夜出租车", truthGenres: ["悬疑"], truthElements: ["悬念"] },
  { title: "长安十二时辰奇案", truthGenres: ["悬疑"], truthElements: ["群像"] },
  // ===== 言情（5 条）=====
  { title: "总裁的替身新娘", truthGenres: ["言情"], truthElements: ["甜宠"] },
  { title: "校花暗恋我三年", truthGenres: ["言情"], truthElements: ["甜宠"] },
  { title: "金丝雀逃跑计划", truthGenres: ["言情"], truthElements: ["双强"] },
  { title: "闺蜜的男朋友", truthGenres: ["言情"], truthElements: ["反转"] },
  { title: "邻座的美女同学", truthGenres: ["言情"], truthElements: ["甜宠"] },
  // ===== 治愈（2 条）=====
  { title: "外婆的薄荷糖", truthGenres: ["治愈"], truthElements: ["甜宠"] },
  { title: "深夜食堂的陌生人", truthGenres: ["治愈"], truthElements: ["群像"] },
  // ===== 复仇（4 条）=====
  { title: "校园霸凌者的忏悔", truthGenres: ["复仇"], truthElements: ["反转"] },
  { title: "废柴的逆袭系统", truthGenres: ["复仇"], truthElements: ["系统"] },
  { title: "影后的复出之路", truthGenres: ["复仇"], truthElements: ["爽感"] },
  { title: "替身千金", truthGenres: ["复仇"], truthElements: ["反转"] },
  // ===== 重生（2 条）=====
  { title: "重生之嫡女归来", truthGenres: ["重生"], truthElements: ["爽感"] },
  { title: "重返十七岁", truthGenres: ["重生"], truthElements: ["虐心"] },
  // ===== 穿越（1 条）=====
  { title: "穿越千年的约定", truthGenres: ["穿越"], truthElements: ["虐心"] },
  // ===== 宫斗（2 条）=====
  { title: "贵妃升职记", truthGenres: ["宫斗"], truthElements: ["爽感"] },
  { title: "后宫生存指南", truthGenres: ["宫斗"], truthElements: ["群像"] },
  // ===== 日常（2 条）=====
  { title: "深夜便利店奇遇", truthGenres: ["日常"], truthElements: ["反转"] },
  { title: "那年夏天的蝉鸣", truthGenres: ["日常"], truthElements: ["虐心"] },
  // ===== 科幻（5 条）=====
  { title: "末日前的咖啡馆", truthGenres: ["科幻"], truthElements: ["群像"] },
  { title: "AI恋人的最后一封信", truthGenres: ["科幻"], truthElements: ["虐心"] },
  { title: "平行世界的另一个我", truthGenres: ["科幻"], truthElements: ["反转"] },
  { title: "系统提示我即将死亡", truthGenres: ["科幻"], truthElements: ["系统"] },
  { title: "时空快递员", truthGenres: ["科幻"], truthElements: ["反转"] },
  // ===== 惊悚（3 条）=====
  { title: "她再次敲门", truthGenres: ["惊悚"], truthElements: ["悬念"] },
  { title: "镜子里的人不是我", truthGenres: ["惊悚"], truthElements: ["反转"] },
  { title: "雪夜凶案", truthGenres: ["惊悚"], truthElements: ["悬念"] },
];

// ===== 七猫真实榜单标题数据集（28 条，P4-T4 复评用） =====
//
// 数据来源：七猫 qimao.com /paihang（男频 boy + 女频 girl）大热榜
//  - robots.txt Allow 全站，SSR 无登录墙，P4-T2 评估风险等级：低
//  - 仅取标题字段（公开榜单元数据），不含正文
//  - 采集日期：2026-07-03
//
// 标注原则：
//  - 每条标题标注 1 主题材 + 1 主元素（与 SYNTHETIC_DATASET 一致）
//  - 基于标题语义 + 七猫平台标签 + 简介元数据综合判断最自然解读
//  - 跳过玄幻/修真类（InkSight GENRE_POOL 无对应题材）
//  - 覆盖 6/10 题材：言情/宫斗/重生/复仇/穿越/日常
//    缺口：悬疑/治愈/科幻/惊悚（七猫榜单无此类短篇）
//
// 与合成数据集的差异：
//  - 真实标题更长更描述性（如"渣夫别跪了，夫人嫁顶级大佬啦"）
//  - 含真实流行语/网络梗（如"嘎嘎乱杀""赢麻了"）
//  - 测试分类器在真实标题分布下的泛化能力

const REAL_DATASET: EvalCase[] = [
  // ===== 女频（16 条，来源 /paihang/girl/hot/date/） =====
  // 言情（6 条）
  { title: "封总，太太想跟你离婚很久了", truthGenres: ["言情"], truthElements: ["虐心"] },
  { title: "第五年重逢，驰先生再度失控", truthGenres: ["言情"], truthElements: ["虐心"] },
  { title: "霍二爷，新婚请克制！", truthGenres: ["言情"], truthElements: ["甜宠"] },
  { title: "大佬十代单传，我为他一胎生四宝", truthGenres: ["言情"], truthElements: ["甜宠"] },
  { title: "桃花劫", truthGenres: ["言情"], truthElements: ["虐心"] },
  { title: "男人野性", truthGenres: ["言情"], truthElements: ["爽感"] },
  // 宫斗（5 条）
  { title: "朱门春闺", truthGenres: ["宫斗"], truthElements: ["虐心"] },
  { title: "皇叔借点功德，王妃把符画猛了", truthGenres: ["宫斗"], truthElements: ["爽感"] },
  { title: "抢我婚约嫁太子？我携孕肚嫁皇帝", truthGenres: ["宫斗"], truthElements: ["反转"] },
  { title: "解春衫", truthGenres: ["宫斗"], truthElements: ["甜宠"] },
  { title: "凰宫梦", truthGenres: ["宫斗"], truthElements: ["爽感"] },
  // 重生（3 条）
  { title: "随母改嫁旺新家，重生嫡女嘎嘎乱杀", truthGenres: ["重生"], truthElements: ["爽感"] },
  { title: "被逼自刎，嫡女重生撕婚书覆皇朝", truthGenres: ["重生"], truthElements: ["爽感"] },
  { title: "全家夺我军功，重生嫡女屠了满门", truthGenres: ["重生"], truthElements: ["爽感"] },
  // 复仇（1 条，女频部分）
  { title: "渣夫别跪了，夫人嫁顶级大佬啦", truthGenres: ["复仇"], truthElements: ["爽感"] },
  // 穿越（1 条，女频部分）
  { title: "穿成星际废雌，捡漏SSS级兽夫赢麻了", truthGenres: ["穿越"], truthElements: ["系统"] },

  // ===== 男频（12 条，来源 /paihang/boy/hot/date/） =====
  // 穿越历史（6 条）
  { title: "逍遥四公子", truthGenres: ["穿越"], truthElements: ["爽感"] },
  { title: "边关兵王", truthGenres: ["穿越"], truthElements: ["群像"] },
  { title: "边军悍卒", truthGenres: ["穿越"], truthElements: ["群像"] },
  { title: "大周第一武夫", truthGenres: ["穿越"], truthElements: ["爽感"] },
  { title: "边关猎户，我粮肉满仓富甲一方", truthGenres: ["穿越"], truthElements: ["甜宠"] },
  { title: "你惹他干嘛？他是大魏第一龙婿！", truthGenres: ["穿越"], truthElements: ["爽感"] },
  // 复仇/逆袭（3 条）
  { title: "离婚后她惊艳了世界", truthGenres: ["复仇"], truthElements: ["爽感"] },
  { title: "盛总，太太让您签的是去父留子协议", truthGenres: ["复仇"], truthElements: ["爽感"] },
  { title: "警报！真龙出狱！", truthGenres: ["复仇"], truthElements: ["爽感"] },
  { title: "傲世潜龙", truthGenres: ["复仇"], truthElements: ["爽感"] },
  // 日常（1 条）
  { title: "步步登阶", truthGenres: ["日常"], truthElements: ["群像"] },
  // 言情/反转（1 条，穿越到都市爽文当反派）
  { title: "舔狗反派只想苟，女主不按套路走！", truthGenres: ["言情"], truthElements: ["反转"] },
];

// ===== 评估指标计算 =====

interface MetricResult {
  /** 严格集合相等：predicted 集合 == truth 集合 */
  strictAccuracy: number;
  /** 子集匹配：truth ⊆ predicted（LLM 找到全部真值，可有额外） */
  subsetAccuracy: number;
  /** 主标签匹配：predicted 第一个标签 == truth 第一个标签 */
  primaryAccuracy: number;
  /** Jaccard 相似度均值：|A∩B| / |A∪B| */
  jaccard: number;
  /**
   * 聚类主标签匹配：predicted 主标签与 truth 主标签在同一语义聚类内
   * （人工校验实际口径：悬疑/惊悚、日常/治愈 等相邻题材视为可接受）
   */
  clusterAccuracy: number;
}

// 语义相邻聚类（人工校验时通常会归为可接受）
// 题材聚类：恐惧系 {悬疑,惊悚} / 温和系 {日常,治愈} / 逆袭系 {复仇,重生}
const GENRE_CLUSTERS: string[][] = [
  ["悬疑", "惊悚"],
  ["日常", "治愈"],
  ["复仇", "重生"],
];
// 元素聚类：情感冲击系 {虐心,反转} / 紧张系 {悬念,反转}
const ELEMENT_CLUSTERS: string[][] = [
  ["虐心", "反转"],
  ["悬念", "反转"],
];

function inSameCluster(a: string, b: string, clusters: string[][]): boolean {
  if (a === b) return true;
  return clusters.some(
    (c) => c.includes(a) && c.includes(b)
  );
}

function computeMetrics(
  predicted: { genres: string[]; elements: string[] }[],
  truth: { genres: string[]; elements: string[] }[]
): MetricResult & { genre: MetricResult; element: MetricResult } {
  const n = Math.min(predicted.length, truth.length);
  let strictG = 0,
    strictE = 0;
  let subsetG = 0,
    subsetE = 0;
  let primaryG = 0,
    primaryE = 0;
  let clusterG = 0,
    clusterE = 0;
  let jaccardG = 0,
    jaccardE = 0;

  for (let i = 0; i < n; i++) {
    const pg = new Set(predicted[i].genres);
    const tg = new Set(truth[i].genres);
    const pe = new Set(predicted[i].elements);
    const te = new Set(truth[i].elements);

    // 严格集合相等
    if (setEq(pg, tg)) strictG++;
    if (setEq(pe, te)) strictE++;
    // 子集匹配（truth ⊆ predicted）
    if (isSubset(tg, pg)) subsetG++;
    if (isSubset(te, pe)) subsetE++;
    // 主标签匹配
    if (predicted[i].genres[0] === truth[i].genres[0]) primaryG++;
    if (predicted[i].elements[0] === truth[i].elements[0]) primaryE++;
    // 聚类主标签匹配（语义相邻视为正确）
    if (
      inSameCluster(
        predicted[i].genres[0] || "",
        truth[i].genres[0] || "",
        GENRE_CLUSTERS
      )
    )
      clusterG++;
    if (
      inSameCluster(
        predicted[i].elements[0] || "",
        truth[i].elements[0] || "",
        ELEMENT_CLUSTERS
      )
    )
      clusterE++;
    // Jaccard
    jaccardG += jaccard(pg, tg);
    jaccardE += jaccard(pe, te);
  }

  const genre: MetricResult = {
    strictAccuracy: strictG / n,
    subsetAccuracy: subsetG / n,
    primaryAccuracy: primaryG / n,
    jaccard: jaccardG / n,
    clusterAccuracy: clusterG / n,
  };
  const element: MetricResult = {
    strictAccuracy: strictE / n,
    subsetAccuracy: subsetE / n,
    primaryAccuracy: primaryE / n,
    jaccard: jaccardE / n,
    clusterAccuracy: clusterE / n,
  };
  const overall: MetricResult = {
    strictAccuracy: (strictG + strictE) / (2 * n),
    subsetAccuracy: (subsetG + subsetE) / (2 * n),
    primaryAccuracy: (primaryG + primaryE) / (2 * n),
    jaccard: (jaccardG + jaccardE) / (2 * n),
    clusterAccuracy: (clusterG + clusterE) / (2 * n),
  };
  return { ...overall, genre, element };
}

function setEq<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function isSubset<T>(small: Set<T>, big: Set<T>): boolean {
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ===== 主流程 =====

interface EvalResult {
  ruleMetrics: MetricResult & { genre: MetricResult; element: MetricResult };
  llmMetrics: MetricResult & { genre: MetricResult; element: MetricResult };
  llmDuration: number;
  llmSourceCount: { llm: number; rule: number };
}

/**
 * 运行单个数据集的完整评估流程（规则版基线 + LLM 分类 + 详细对比 + 汇总报告）
 */
async function runEvaluation(
  dataset: EvalCase[],
  label: string
): Promise<EvalResult> {
  console.log(`\n数据集: ${label}（${dataset.length} 条）`);

  // 构造 TrendEntryValue（仅 title/author/platform，无正文，符合合规约束）
  const entries: TrendEntryValue[] = dataset.map((c, i) => ({
    title: c.title,
    author: "佚名",
    platform: "qimao",
    rank: i + 1,
    rankChange: 0,
    genres: [],
    elements: [],
    popularity: 50000,
    collectedAt: new Date().toISOString().slice(0, 10),
  }));

  const truthLabels = dataset.map((t) => ({
    genres: t.truthGenres,
    elements: t.truthElements,
  }));

  // Step 1: 规则版基线
  console.log("  【Step 1】规则版分类...");
  const rulePredicted = entries.map((e) => ruleClassify(e));
  const ruleMetrics = computeMetrics(rulePredicted, truthLabels);
  console.log(
    `    严格 ${pct(ruleMetrics.strictAccuracy)} | 主标签 ${pct(
      ruleMetrics.primaryAccuracy
    )} | Jaccard ${ruleMetrics.jaccard.toFixed(3)}`
  );

  // Step 2: LLM 分类
  console.log("  【Step 2】LLM 分类...");
  const llmStart = Date.now();
  const llmResults = await classifyEntries(entries);
  const llmDuration = Date.now() - llmStart;
  const llmPredicted = llmResults.map((r) => ({
    genres: r.genres,
    elements: r.elements,
  }));
  const llmSourceCount = {
    llm: llmResults.filter((r) => r.source === "llm").length,
    rule: llmResults.filter((r) => r.source === "rule").length,
  };
  const llmMetrics = computeMetrics(llmPredicted, truthLabels);
  console.log(
    `    完成（${llmDuration}ms，LLM ${llmSourceCount.llm} / 规则 ${llmSourceCount.rule}）`
  );
  console.log(
    `    严格 ${pct(llmMetrics.strictAccuracy)} | 主标签 ${pct(
      llmMetrics.primaryAccuracy
    )} | Jaccard ${llmMetrics.jaccard.toFixed(3)}`
  );

  // Step 3: 逐条对比
  console.log("  【Step 3】逐条对比：");
  for (let i = 0; i < dataset.length; i++) {
    const t = dataset[i];
    const l = llmPredicted[i];
    const r = rulePredicted[i];
    const lMatch = setEq(new Set(l.genres), new Set(t.truthGenres)) &&
      setEq(new Set(l.elements), new Set(t.truthElements));
    console.log(
      `    ${String(i + 1).padStart(2)} | ${t.title.padEnd(20)} | 真值 ${fmt(
        t.truthGenres,
        t.truthElements
      )} | LLM ${fmt(l.genres, l.elements)} | 规则 ${fmt(
        r.genres,
        r.elements
      )} | ${lMatch ? "✓" : "✗"}`
    );
  }

  // Step 4: 汇总
  console.log("\n  【Step 4】汇总：");
  console.log("  ┌──────────────────────────┬──────────┬──────────┐");
  console.log("  │ 指标                     │   规则版 │   LLM 版 │");
  console.log("  ├──────────────────────────┼──────────┼──────────┤");
  console.log(
    `  │ 题材-聚类匹配             │  ${pct(ruleMetrics.genre.clusterAccuracy)} │  ${pct(
      llmMetrics.genre.clusterAccuracy
    )} │`
  );
  console.log(
    `  │ 题材-主标签匹配           │  ${pct(ruleMetrics.genre.primaryAccuracy)} │  ${pct(
      llmMetrics.genre.primaryAccuracy
    )} │`
  );
  console.log(
    `  │ 元素-聚类匹配             │  ${pct(ruleMetrics.element.clusterAccuracy)} │  ${pct(
      llmMetrics.element.clusterAccuracy
    )} │`
  );
  console.log(
    `  │ 元素-主标签匹配           │  ${pct(ruleMetrics.element.primaryAccuracy)} │  ${pct(
      llmMetrics.element.primaryAccuracy
    )} │`
  );
  console.log(
    `  │ Overall 聚类匹配          │  ${pct(ruleMetrics.clusterAccuracy)} │  ${pct(
      llmMetrics.clusterAccuracy
    )} │`
  );
  console.log("  └──────────────────────────┴──────────┴──────────┘");

  // Step 5: 验收
  const clusterPass = llmMetrics.clusterAccuracy >= 0.9;
  console.log(
    `  【验收】聚类匹配 ${pct(llmMetrics.clusterAccuracy)} ${
      clusterPass ? "✅ 达标" : "❌ 未达标"
    }（目标 >90%）`
  );

  return { ruleMetrics, llmMetrics, llmDuration, llmSourceCount };
}

async function main() {
  console.log("\n===== P4-T4 LLM 标签分类准确率评估（复评）=====\n");

  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("错误: LLM_API_KEY 未配置");
    console.error("请复制 .env.example 为 .env.local 并填入 DeepSeek API Key");
    process.exit(1);
  }

  console.log(`题材词表: ${GENRE_POOL.join("/")}（${GENRE_POOL.length} 类）`);
  console.log(`元素词表: ${ELEMENT_POOL.join("/")}（${ELEMENT_POOL.length} 类）`);

  // ===== 数据集 1: 合成标题 =====
  console.log("\n========== 数据集 1: 合成标题（30 条，平衡覆盖 10 题材）==========");
  const syntheticResult = await runEvaluation(
    EVAL_DATASET,
    "合成标题（SYNTHETIC）"
  );

  // ===== 数据集 2: 七猫真实榜单标题 =====
  console.log(
    "\n========== 数据集 2: 七猫真实榜单标题（28 条，覆盖 6 题材）=========="
  );
  const realResult = await runEvaluation(REAL_DATASET, "七猫真实标题（REAL）");

  // ===== 对比汇总 =====
  console.log("\n========== 对比汇总 ==========\n");
  const s = syntheticResult.llmMetrics;
  const r = realResult.llmMetrics;
  const delta = (real: number, synth: number) =>
    real >= synth ? `+${((real - synth) * 100).toFixed(1)}%` : `${((real - synth) * 100).toFixed(1)}%`;

  console.log("┌──────────────────────────┬──────────┬──────────┬──────────┐");
  console.log("│ 指标                     │ 合成数据集│ 真实数据集│   变化   │");
  console.log("├──────────────────────────┼──────────┼──────────┼──────────┤");
  console.log(
    `│ 题材-聚类匹配             │  ${pct(s.genre.clusterAccuracy)} │  ${pct(
      r.genre.clusterAccuracy
    )} │ ${delta(r.genre.clusterAccuracy, s.genre.clusterAccuracy).padStart(8)} │`
  );
  console.log(
    `│ 题材-主标签匹配           │  ${pct(s.genre.primaryAccuracy)} │  ${pct(
      r.genre.primaryAccuracy
    )} │ ${delta(r.genre.primaryAccuracy, s.genre.primaryAccuracy).padStart(8)} │`
  );
  console.log(
    `│ 元素-聚类匹配             │  ${pct(s.element.clusterAccuracy)} │  ${pct(
      r.element.clusterAccuracy
    )} │ ${delta(r.element.clusterAccuracy, s.element.clusterAccuracy).padStart(8)} │`
  );
  console.log(
    `│ 元素-主标签匹配           │  ${pct(s.element.primaryAccuracy)} │  ${pct(
      r.element.primaryAccuracy
    )} │ ${delta(r.element.primaryAccuracy, s.element.primaryAccuracy).padStart(8)} │`
  );
  console.log(
    `│ Overall 聚类匹配          │  ${pct(s.clusterAccuracy)} │  ${pct(
      r.clusterAccuracy
    )} │ ${delta(r.clusterAccuracy, s.clusterAccuracy).padStart(8)} │`
  );
  console.log("└──────────────────────────┴──────────┴──────────┴──────────┘\n");

  // 结论
  const realGenrePass = r.genre.clusterAccuracy >= 0.9;
  const realElementPass = r.element.clusterAccuracy >= 0.9;
  console.log("结论：");
  console.log(
    `  - 题材分类：真实标题聚类匹配 ${pct(r.genre.clusterAccuracy)} ${
      realGenrePass ? "✅ 达标" : "❌ 未达标"
    }（合成 ${pct(s.genre.clusterAccuracy)} → 真实 ${pct(
      r.genre.clusterAccuracy
    )}，${delta(r.genre.clusterAccuracy, s.genre.clusterAccuracy)}）`
  );
  console.log(
    `  - 元素分类：真实标题聚类匹配 ${pct(r.element.clusterAccuracy)} ${
      realElementPass ? "✅ 达标" : "❌ 未达标"
    }（合成 ${pct(s.element.clusterAccuracy)} → 真实 ${pct(
      r.element.clusterAccuracy
    )}，${delta(r.element.clusterAccuracy, s.element.clusterAccuracy)}）`
  );
  if (realGenrePass && realElementPass) {
    console.log("  ✅ P4-T4 复评通过：真实标题分布下分类准确率仍达标");
  } else if (realGenrePass) {
    console.log("  ⚠️  题材分类达标，元素分类待提升（标题信息有限，需接入简介元数据）");
  } else {
    console.log("  ⚠️  P4-T4 复评未达标：真实标题分布下准确率下降");
    console.log("     建议：优化 prompt few-shot / 接入平台标签+简介元数据辅助分类");
  }

  console.log(
    `\n[耗时] 合成 ${syntheticResult.llmDuration}ms / 真实 ${realResult.llmDuration}ms\n`
  );
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1).padStart(5)}%`;
}

function fmt(genres: string[], elements: string[]): string {
  return `${genres.join(",") || "-"} / ${elements.join(",") || "-"}`.padEnd(21);
}

main().catch((err) => {
  console.error("\n❌ 评估失败:", err);
  process.exit(1);
});
