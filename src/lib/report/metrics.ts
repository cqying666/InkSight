/**
 * P6-T6 闭环完成率监控指标计算
 *
 * 对齐 PRD §7.2 指标体系：
 *  - 北极星：月活创作者完成"拆文→创作"闭环的次数
 *  - 各模块：学习/趋势/素材/创作/闭环
 *
 * 数据源：analytics.ts 的 localStorage 事件队列
 *  - 纯函数设计：输入 events 数组，输出计算好的指标
 *  - 无副作用，便于测试与未来服务端迁移
 *  - sid（匿名会话 ID）作为用户代理，跨会话去重
 */

import type { AnalyticsEvent } from "./analytics";

// ===== 指标类型定义 =====

export interface MetricStatus {
  /** 当前值 */
  value: number;
  /** 目标值（PRD §7.2） */
  target: number;
  /** 单位（%/次/分） */
  unit: "%" | "次" | "分" | "个";
  /** 是否达标 */
  achieved: boolean;
  /** 分子/分母（便于调试） */
  numerator: number;
  denominator: number;
}

export interface ModuleMetrics {
  /** 模块名 */
  module: string;
  /** 指标列表 */
  metrics: {
    name: string;
    label: string;
    status: MetricStatus;
  }[];
}

export interface DashboardData {
  /** 北极星指标 */
  northStar: {
    label: string;
    value: number;
    target: number;
    unit: string;
    description: string;
    achieved: boolean;
  };
  /** 各模块指标 */
  modules: ModuleMetrics[];
  /** 闭环漏斗（各阶段用户数） */
  loopFunnel: {
    stage: string;
    count: number;
    rate: number; // 相对上一阶段的转化率
  }[];
  /** 事件总数 */
  totalEvents: number;
  /** 活跃会话数（唯一 sid） */
  activeSessions: number;
  /** 时间范围（最近 N 天） */
  timeRangeDays: number;
  /** 生成时间 */
  generatedAt: string;
  /** 无数据标志 */
  isEmpty: boolean;
}

// ===== 工具函数 =====

function uniqueSids(events: AnalyticsEvent[]): Set<string> {
  const sids = new Set<string>();
  for (const e of events) {
    if (e.sid && e.sid !== "ssr") sids.add(e.sid);
  }
  return sids;
}

function eventsByName(
  events: AnalyticsEvent[],
  name: AnalyticsEvent["name"]
): AnalyticsEvent[] {
  return events.filter((e) => e.name === name);
}

function uniqueSidsForEvents(events: AnalyticsEvent[]): Set<string> {
  const sids = new Set<string>();
  for (const e of events) {
    if (e.sid && e.sid !== "ssr") sids.add(e.sid);
  }
  return sids;
}

function makeStatus(
  value: number,
  target: number,
  unit: MetricStatus["unit"],
  numerator: number,
  denominator: number
): MetricStatus {
  return {
    value,
    target,
    unit,
    achieved: value >= target,
    numerator,
    denominator,
  };
}

/** 计算百分比，分母为 0 时返回 0 */
function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

// ===== 闭环判定 =====

/**
 * 判定一个 sid 是否完成完整闭环：
 * 拆文（analysis_completed）→ 创作（write_entered 或 draft_completed）→ 写后分析（write_analyzed）
 *
 * 注意：仅检查事件存在性，不检查时间顺序（localStorage 队列可能跨会话）
 */
function isLoopCompleted(events: AnalyticsEvent[], sid: string): boolean {
  const sidEvents = events.filter((e) => e.sid === sid);
  const names = new Set(sidEvents.map((e) => e.name));
  const hasAnalysis = names.has("analysis_completed");
  const hasWriting = names.has("write_entered") || names.has("draft_completed");
  const hasPostAnalysis = names.has("write_analyzed");
  return hasAnalysis && hasWriting && hasPostAnalysis;
}

/**
 * 判定 sid 是否完成"拆文→创作"闭环（北极星指标口径）
 */
function isTeardownToWritingLoop(
  events: AnalyticsEvent[],
  sid: string
): boolean {
  const sidEvents = events.filter((e) => e.sid === sid);
  const names = new Set(sidEvents.map((e) => e.name));
  return names.has("analysis_completed") && names.has("write_entered");
}

// ===== 主入口 =====

/**
 * 从事件队列计算仪表盘数据
 *
 * @param events analytics 队列中的全部事件
 * @param timeRangeDays 时间范围（默认 30 天，0 表示全部）
 */
export function computeDashboardData(
  events: AnalyticsEvent[],
  timeRangeDays = 30
): DashboardData {
  // 按时间过滤
  let filtered = events;
  if (timeRangeDays > 0) {
    const cutoff = Date.now() - timeRangeDays * 24 * 60 * 60 * 1000;
    filtered = events.filter((e) => new Date(e.ts).getTime() >= cutoff);
  }

  const totalEvents = filtered.length;
  const activeSids = uniqueSids(filtered);
  const activeSessionCount = activeSids.size;

  // 空数据快速返回
  if (totalEvents === 0) {
    return {
      northStar: {
        label: "闭环完成次数",
        value: 0,
        target: 1,
        unit: "次/月",
        description: "月活创作者完成「拆文→创作」闭环的次数",
        achieved: false,
      },
      modules: [],
      loopFunnel: [],
      totalEvents: 0,
      activeSessions: 0,
      timeRangeDays,
      generatedAt: new Date().toISOString(),
      isEmpty: true,
    };
  }

  // ===== P6-T9 单次遍历建索引（替代 13 次 eventsByName + per-sid 闭环判定） =====
  // 算法从 O(13E + S×E) 降到 O(E)
  const eventsByNameMap = new Map<string, AnalyticsEvent[]>();
  const sidEventNames = new Map<string, Set<string>>(); // sid → 该 sid 的事件名集合
  let uploadCount = 0,
    analysisCount = 0,
    suggestionAdoptedCount = 0,
    trendViewedCount = 0,
    trendElementSavedCount = 0,
    materialSavedCount = 0,
    materialInsertedCount = 0,
    writeEnteredCount = 0,
    draftCompletedCount = 0,
    writeAnalyzedCount = 0,
    reportRatedCount = 0,
    trendRatedCount = 0,
    materialRatedCount = 0,
    writeRatedCount = 0;

  for (const e of filtered) {
    // 按事件名分组
    let arr = eventsByNameMap.get(e.name);
    if (!arr) {
      arr = [];
      eventsByNameMap.set(e.name, arr);
    }
    arr.push(e);

    // 按 sid 累积事件名集合（用于闭环判定）
    if (e.sid && e.sid !== "ssr") {
      let nameSet = sidEventNames.get(e.sid);
      if (!nameSet) {
        nameSet = new Set();
        sidEventNames.set(e.sid, nameSet);
      }
      nameSet.add(e.name);
    }

    // 计数器（避免后续再遍历 Map 取 length）
    switch (e.name) {
      case "novel_uploaded":
        uploadCount++;
        break;
      case "analysis_completed":
        analysisCount++;
        break;
      case "suggestion_adopted":
        suggestionAdoptedCount++;
        break;
      case "trend_viewed":
        trendViewedCount++;
        break;
      case "trend_element_saved":
        trendElementSavedCount++;
        break;
      case "material_saved":
        materialSavedCount++;
        break;
      case "material_inserted":
        materialInsertedCount++;
        break;
      case "write_entered":
        writeEnteredCount++;
        break;
      case "draft_completed":
        draftCompletedCount++;
        break;
      case "write_analyzed":
        writeAnalyzedCount++;
        break;
      case "report_rated":
        reportRatedCount++;
        break;
      case "trend_rated":
        trendRatedCount++;
        break;
      case "material_rated":
        materialRatedCount++;
        break;
      case "write_rated":
        writeRatedCount++;
        break;
    }
  }

  // 便捷取数（保持下游代码可读性）
  const getEvents = (name: string): AnalyticsEvent[] =>
    eventsByNameMap.get(name) ?? [];
  const uploadEvents = getEvents("novel_uploaded");
  const analysisEvents = getEvents("analysis_completed");
  const suggestionAdoptedEvents = getEvents("suggestion_adopted");
  const trendViewedEvents = getEvents("trend_viewed");
  const trendElementSavedEvents = getEvents("trend_element_saved");
  const materialSavedEvents = getEvents("material_saved");
  const materialInsertedEvents = getEvents("material_inserted");
  const writeEnteredEvents = getEvents("write_entered");
  const draftCompletedEvents = getEvents("draft_completed");
  const writeAnalyzedEvents = getEvents("write_analyzed");
  const reportRatedEvents = getEvents("report_rated");
  const trendRatedEvents = getEvents("trend_rated");
  const materialRatedEvents = getEvents("material_rated");
  const writeRatedEvents = getEvents("write_rated");

  // ===== 北极星：闭环完成次数（从 sidEventNames 单次查表，O(S)） =====
  const teardownToWritingLoopSids = new Set<string>();
  const fullLoopSids = new Set<string>();
  for (const [sid, names] of sidEventNames) {
    const hasAnalysis = names.has("analysis_completed");
    const hasWriting = names.has("write_entered") || names.has("draft_completed");
    const hasPostAnalysis = names.has("write_analyzed");
    if (hasAnalysis && hasWriting) {
      teardownToWritingLoopSids.add(sid);
    }
    if (hasAnalysis && hasWriting && hasPostAnalysis) {
      fullLoopSids.add(sid);
    }
  }

  // ===== 学习模块指标 =====
  const learningModule: ModuleMetrics = {
    module: "学习模块",
    metrics: [
      {
        name: "first_teardown_rate",
        label: "首次拆文完成率",
        status: makeStatus(
          pct(analysisEvents.length, uploadEvents.length),
          85,
          "%",
          analysisEvents.length,
          uploadEvents.length
        ),
      },
      {
        name: "avg_teardown_count",
        label: "人均拆文次数",
        status: makeStatus(
          activeSessionCount > 0
            ? analysisEvents.length / activeSessionCount
            : 0,
          3,
          "次",
          analysisEvents.length,
          activeSessionCount
        ),
      },
      {
        name: "report_useful_score",
        label: "报告有用评分（均值）",
        status: makeStatus(
          avgRating(reportRatedEvents),
          4.0,
          "分",
          reportRatedEvents.length,
          reportRatedEvents.length
        ),
      },
      {
        name: "suggestion_adoption_rate",
        label: "建议采纳率",
        status: makeStatus(
          pct(suggestionAdoptedEvents.length, analysisEvents.length),
          30,
          "%",
          suggestionAdoptedEvents.length,
          analysisEvents.length
        ),
      },
    ],
  };

  // ===== 趋势模块指标 =====
  const trendModule: ModuleMetrics = {
    module: "趋势模块",
    metrics: [
      {
        name: "trend_weekly_active_rate",
        label: "雷达周活跃率",
        status: makeStatus(
          pct(uniqueSidsForEvents(trendViewedEvents).size, activeSessionCount),
          40,
          "%",
          uniqueSidsForEvents(trendViewedEvents).size,
          activeSessionCount
        ),
      },
      {
        name: "trend_element_save_rate",
        label: "趋势元素收藏率",
        status: makeStatus(
          pct(trendElementSavedEvents.length, trendViewedEvents.length),
          15,
          "%",
          trendElementSavedEvents.length,
          trendViewedEvents.length
        ),
      },
      {
        name: "trend_useful_score",
        label: "趋势有用评分（均值）",
        status: makeStatus(
          avgRating(trendRatedEvents),
          4.0,
          "分",
          trendRatedEvents.length,
          trendRatedEvents.length
        ),
      },
    ],
  };

  // ===== 素材模块指标 =====
  const materialUsers = new Set<string>();
  for (const e of materialSavedEvents) materialUsers.add(e.sid);
  for (const e of materialInsertedEvents) materialUsers.add(e.sid);

  const materialModule: ModuleMetrics = {
    module: "素材模块",
    metrics: [
      {
        name: "material_weekly_active_rate",
        label: "素材库周活跃率",
        status: makeStatus(
          pct(materialUsers.size, activeSessionCount),
          30,
          "%",
          materialUsers.size,
          activeSessionCount
        ),
      },
      {
        name: "material_adoption_rate",
        label: "素材采纳率",
        status: makeStatus(
          pct(materialInsertedEvents.length, materialSavedEvents.length),
          20,
          "%",
          materialInsertedEvents.length,
          materialSavedEvents.length
        ),
      },
      {
        name: "material_useful_score",
        label: "素材有用评分（均值）",
        status: makeStatus(
          avgRating(materialRatedEvents),
          4.0,
          "分",
          materialRatedEvents.length,
          materialRatedEvents.length
        ),
      },
    ],
  };

  // ===== 创作模块指标 =====
  const writingModule: ModuleMetrics = {
    module: "创作模块",
    metrics: [
      {
        name: "writing_weekly_active_rate",
        label: "创作工作台周活跃率",
        status: makeStatus(
          pct(uniqueSidsForEvents(writeEnteredEvents).size, activeSessionCount),
          50,
          "%",
          uniqueSidsForEvents(writeEnteredEvents).size,
          activeSessionCount
        ),
      },
      {
        name: "avg_draft_count",
        label: "人均创作篇数",
        status: makeStatus(
          activeSessionCount > 0
            ? draftCompletedEvents.length / activeSessionCount
            : 0,
          1,
          "次",
          draftCompletedEvents.length,
          activeSessionCount
        ),
      },
      {
        name: "post_analysis_trigger_rate",
        label: "写后分析触发率",
        status: makeStatus(
          pct(writeAnalyzedEvents.length, draftCompletedEvents.length),
          60,
          "%",
          writeAnalyzedEvents.length,
          draftCompletedEvents.length
        ),
      },
      {
        name: "writing_useful_score",
        label: "工作台有用评分（均值）",
        status: makeStatus(
          avgRating(writeRatedEvents),
          4.0,
          "分",
          writeRatedEvents.length,
          writeRatedEvents.length
        ),
      },
    ],
  };

  // ===== 闭环模块指标 =====
  const loopModule: ModuleMetrics = {
    module: "闭环指标",
    metrics: [
      {
        name: "loop_completion_rate",
        label: "闭环完成率",
        status: makeStatus(
          pct(fullLoopSids.size, activeSessionCount),
          30,
          "%",
          fullLoopSids.size,
          activeSessionCount
        ),
      },
      {
        name: "loop_count_per_user",
        label: "闭环完成次数",
        status: makeStatus(
          activeSessionCount > 0
            ? fullLoopSids.size / activeSessionCount
            : 0,
          1,
          "次",
          fullLoopSids.size,
          activeSessionCount
        ),
      },
    ],
  };

  // ===== 闭环漏斗 =====
  const funnelStages = [
    { stage: "上传小说", sids: uniqueSidsForEvents(uploadEvents) },
    { stage: "完成拆文", sids: uniqueSidsForEvents(analysisEvents) },
    { stage: "进入创作", sids: uniqueSidsForEvents(writeEnteredEvents) },
    { stage: "完成作品", sids: uniqueSidsForEvents(draftCompletedEvents) },
    { stage: "写后分析", sids: uniqueSidsForEvents(writeAnalyzedEvents) },
  ];

  const loopFunnel = funnelStages.map((s, i) => {
    const count = s.sids.size;
    const prevCount = i > 0 ? funnelStages[i - 1].sids.size : count;
    return {
      stage: s.stage,
      count,
      rate: i > 0 ? pct(count, prevCount) : 100,
    };
  });

  return {
    northStar: {
      label: "闭环完成次数",
      value: teardownToWritingLoopSids.size,
      target: 1,
      unit: "次/月",
      description: "月活创作者完成「拆文→创作」闭环的次数",
      achieved: teardownToWritingLoopSids.size >= 1,
    },
    modules: [
      learningModule,
      trendModule,
      materialModule,
      writingModule,
      loopModule,
    ],
    loopFunnel,
    totalEvents,
    activeSessions: activeSessionCount,
    timeRangeDays,
    generatedAt: new Date().toISOString(),
    isEmpty: false,
  };
}

/**
 * 计算评分事件的均值
 */
function avgRating(events: AnalyticsEvent[]): number {
  if (events.length === 0) return 0;
  const sum = events.reduce((acc, e) => {
    const rating = e.props.rating ?? e.props.score ?? 0;
    return acc + (typeof rating === "number" ? rating : 0);
  }, 0);
  return sum / events.length;
}

// ===== 用户历史画像（供 P6-T1 个性化推荐用） =====

export interface UserProfile {
  /** 拆文次数 */
  teardownCount: number;
  /** 创作次数 */
  writingCount: number;
  /** 完成作品数 */
  draftCount: number;
  /** 写后分析次数 */
  postAnalysisCount: number;
  /** 收藏素材数 */
  materialSavedCount: number;
  /** 插入素材数 */
  materialInsertedCount: number;
  /** 查看趋势次数 */
  trendViewCount: number;
  /** 收藏趋势元素数 */
  trendSavedCount: number;
  /** 采纳建议数 */
  suggestionAdoptedCount: number;
  /** 是否完成过完整闭环 */
  hasCompletedLoop: boolean;
  /** 主要创作类型（从 write_entered / analysis_completed 的 type prop 推断） */
  preferredType: string | null;
  /** 最常用入口 */
  primaryEntry: string | null;
  /** 用户阶段标签 */
  stage: "newcomer" | "learner" | "creator" | "looped";
  /** P6-T2 历史薄弱点 label Top 3（从 teardown-history 聚合，按 critical×3+warning×1 加权） */
  weakAreas: string[];
}

/**
 * P6-T2 薄弱点 label → 素材 componentKind 映射
 *
 * 用于把用户的薄弱点翻译成可推荐的素材类型，
 * 例如"反转数量"薄弱 → 推荐 reversal_pattern 类素材
 */
export const WEAKNESS_TO_COMPONENT_KIND: Record<string, string> = {
  // 骨架层薄弱点 → 组件素材 kind（对齐 ComponentKind 枚举）
  反转数量: "reversal",
  反转节点位置: "reversal",
  三幕结构占比: "plot_template",
  开头钩子强度: "hook",
  开头钩子类型: "hook",
  结局类型: "plot_template",
  事件密度: "plot_template",
  // 血肉层薄弱点
  情绪曲线: "emotion_curve",
  对话与叙述比例: "dialogue_pattern",
  感官描写频率: "dialogue_pattern",
  人物弧光: "character_arc",
  冲突层次: "conflict",
};

/**
 * 从事件历史推断用户画像
 *
 * 阶段判定：
 *  - newcomer：拆文 < 3 且无创作
 *  - learner：拆文 ≥ 3 但无创作
 *  - creator：有创作但未完成闭环
 *  - looped：完成过完整闭环
 */
export function computeUserProfile(events: AnalyticsEvent[]): UserProfile {
  const analysisCount = eventsByName(events, "analysis_completed").length;
  const writeEnterCount = eventsByName(events, "write_entered").length;
  const draftCount = eventsByName(events, "draft_completed").length;
  const postAnalysisCount = eventsByName(events, "write_analyzed").length;
  const materialSaved = eventsByName(events, "material_saved").length;
  const materialInserted = eventsByName(events, "material_inserted").length;
  const trendViewed = eventsByName(events, "trend_viewed").length;
  const trendSaved = eventsByName(events, "trend_element_saved").length;
  const suggestionAdopted = eventsByName(
    events,
    "suggestion_adopted"
  ).length;

  // 闭环判定（用全部事件，不限时间范围）
  const sids = uniqueSids(events);
  let hasCompletedLoop = false;
  for (const sid of sids) {
    if (isLoopCompleted(events, sid)) {
      hasCompletedLoop = true;
      break;
    }
  }

  // 主要创作类型（从 analysis_completed 的 type prop 取众数）
  const typeCounts = new Map<string, number>();
  for (const e of eventsByName(events, "analysis_completed")) {
    const t = e.props.type as string;
    if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  let preferredType: string | null = null;
  let maxCount = 0;
  for (const [t, c] of typeCounts) {
    if (c > maxCount) {
      maxCount = c;
      preferredType = t;
    }
  }

  // 最常用入口（从 writing_started 的 from_source 取众数）
  const entryCounts = new Map<string, number>();
  for (const e of events.filter((x) => x.name === "writing_started")) {
    const src = e.props.from_source as string;
    if (src) entryCounts.set(src, (entryCounts.get(src) || 0) + 1);
  }
  let primaryEntry: string | null = null;
  maxCount = 0;
  for (const [src, c] of entryCounts) {
    if (c > maxCount) {
      maxCount = c;
      primaryEntry = src;
    }
  }

  // 阶段判定
  let stage: UserProfile["stage"] = "newcomer";
  if (hasCompletedLoop) {
    stage = "looped";
  } else if (writeEnterCount > 0 || draftCount > 0) {
    stage = "creator";
  } else if (analysisCount >= 3) {
    stage = "learner";
  }

  return {
    teardownCount: analysisCount,
    writingCount: writeEnterCount,
    draftCount,
    postAnalysisCount,
    materialSavedCount: materialSaved,
    materialInsertedCount: materialInserted,
    trendViewCount: trendViewed,
    trendSavedCount: trendSaved,
    suggestionAdoptedCount: suggestionAdopted,
    hasCompletedLoop,
    preferredType,
    primaryEntry,
    stage,
    // P6-T2 默认空，由 use-user-profile 合并 teardown-history 聚合结果
    weakAreas: [],
  };
}
