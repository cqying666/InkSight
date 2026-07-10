/**
 * 首页数据聚合：近期创作脉络 + 功能使用分布
 *
 * 数据源：analytics.ts localStorage 事件队列
 * 纯函数设计，便于测试与未来服务端迁移。
 */

import type { AnalyticsEvent } from "./analytics";

/** 单日活动节点 */
export interface DailyActivity {
  /** YYYY-MM-DD */
  date: string;
  /** 该日事件数 */
  count: number;
  /** 该日涉及的功能模块（去重） */
  modules: string[];
}

/** 功能使用分布项 */
export interface ModuleUsage {
  /** 模块显示名 */
  label: string;
  /** 事件数 */
  count: number;
  /** 占比 0-100 */
  pct: number;
}

export interface HomeData {
  /** 近 N 天活动脉络 */
  timeline: DailyActivity[];
  /** 功能使用分布（按事件数降序） */
  moduleUsage: ModuleUsage[];
  /** 事件总数 */
  totalEvents: number;
  /** 活跃天数（有事件的天数） */
  activeDays: number;
  /** 最近一次活动 ISO 时间戳，null 表示无活动 */
  lastActivityAt: string | null;
  /** 是否无数据 */
  isEmpty: boolean;
}

/** 模块归类：事件名 → 显示名 */
const EVENT_MODULE: Record<string, string> = {
  novel_uploaded: "拆文",
  upload_submitted: "拆文",
  analysis_completed: "拆文",
  analysis_failed: "拆文",
  report_viewed: "拆文",
  report_exported: "拆文",
  report_rated: "拆文",
  suggestion_adopted: "拆文",
  write_entered: "创作",
  writing_started: "创作",
  outline_created: "创作",
  draft_completed: "创作",
  write_analyzed: "创作",
  write_focus_mode_toggled: "创作",
  write_rated: "创作",
  trend_viewed: "趋势",
  trend_element_saved: "趋势",
  trend_classified: "趋势",
  trend_rated: "趋势",
  material_saved: "素材",
  material_auto_extracted: "素材",
  material_inserted: "素材",
  material_searched: "素材",
  material_rated: "素材",
};

const MODULE_LABELS: Record<string, string> = {
  拆文: "拆文",
  创作: "创作",
  趋势: "趋势",
  素材: "素材",
};

/** 近 14 天聚合（按天分组） */
export function computeHomeData(
  events: AnalyticsEvent[],
  days = 14
): HomeData {
  if (events.length === 0) {
    return {
      timeline: buildEmptyTimeline(days),
      moduleUsage: [],
      totalEvents: 0,
      activeDays: 0,
      lastActivityAt: null,
      isEmpty: true,
    };
  }

  // 近 N 天截止时间
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);

  const filtered = events.filter(
    (e) => new Date(e.ts).getTime() >= cutoff.getTime()
  );

  // 按天分组
  const dayMap = new Map<string, DailyActivity>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setDate(d.getDate() + i);
    const key = formatDate(d);
    dayMap.set(key, { date: key, count: 0, modules: [] });
  }

  let lastActivityAt: string | null = null;
  for (const e of filtered) {
    const key = formatDate(new Date(e.ts));
    const day = dayMap.get(key);
    if (day) {
      day.count++;
      const mod = EVENT_MODULE[e.name];
      if (mod && !day.modules.includes(mod)) {
        day.modules.push(mod);
      }
      if (!lastActivityAt || e.ts > lastActivityAt) {
        lastActivityAt = e.ts;
      }
    }
  }

  const timeline = Array.from(dayMap.values());

  // 模块使用分布
  const moduleCounts = new Map<string, number>();
  for (const e of filtered) {
    const mod = EVENT_MODULE[e.name];
    if (mod) {
      moduleCounts.set(mod, (moduleCounts.get(mod) || 0) + 1);
    }
  }
  const totalModuleEvents = Array.from(moduleCounts.values()).reduce(
    (a, b) => a + b,
    0
  );
  const moduleUsage: ModuleUsage[] = Array.from(moduleCounts.entries())
    .map(([mod, count]) => ({
      label: MODULE_LABELS[mod] || mod,
      count,
      pct: totalModuleEvents > 0 ? (count / totalModuleEvents) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const activeDays = timeline.filter((d) => d.count > 0).length;

  return {
    timeline,
    moduleUsage,
    totalEvents: filtered.length,
    activeDays,
    lastActivityAt,
    isEmpty: filtered.length === 0,
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildEmptyTimeline(days: number): DailyActivity[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days + 1);
  const timeline: DailyActivity[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    timeline.push({
      date: formatDate(d),
      count: 0,
      modules: [],
    });
  }
  return timeline;
}

/** 教练上下文感知开场白：根据用户阶段 + 最近活动生成 */
export function getCoachGreeting(
  profile: {
    stage: "newcomer" | "learner" | "creator" | "looped";
    teardownCount: number;
    writingCount: number;
    draftCount: number;
  },
  lastActivityAt: string | null
): { title: string; message: string; hint: string } {
  const hoursSince = lastActivityAt
    ? (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60)
    : null;

  // 首次使用
  if (profile.stage === "newcomer" && !lastActivityAt) {
    return {
      title: "欢迎来到 InkSight",
      message:
        "我是你的短篇小说创作教练。建议从拆解一篇你喜欢的小说开始——把它的结构、节奏、情绪曲线拆出来，变成你能复用的方法。",
      hint: "试试上传一篇短篇小说？",
    };
  }

  // 超过 3 天未活跃
  if (hoursSince !== null && hoursSince > 72) {
    return {
      title: "好久不见",
      message: `距离上次使用已经 ${Math.floor(hoursSince / 24)} 天了。${
        profile.stage === "looped"
          ? "你已经跑通过完整闭环，这次想继续打磨哪篇作品？"
          : "要不要看看最近的趋势，找找新的创作灵感？"
      }`,
      hint: "继续上次的创作，或看看今天的趋势",
    };
  }

  // 有未完稿的创作（有 write_entered 但无 draft_completed）
  if (profile.writingCount > 0 && profile.draftCount === 0) {
    return {
      title: "继续你的创作",
      message:
        "上次你进入了创作工作台但还没完成作品。今天把它写完吧——哪怕先写完一幕，也是推进。",
      hint: "进入创作工作台继续",
    };
  }

  // 已完成闭环
  if (profile.stage === "looped") {
    return {
      title: "继续保持",
      message: `你已经跑通了「拆文→创作→复盘」的完整闭环 ${profile.teardownCount} 次拆文、${profile.draftCount} 篇作品。这次想挑战什么类型？`,
      hint: "开新稿，或拆一篇不同类型的小说",
    };
  }

  // 学习者阶段
  if (profile.stage === "learner") {
    return {
      title: "从拆到写",
      message: `你已经拆了 ${profile.teardownCount} 篇小说。拆得够多了——该动笔了。把拆到的方法用起来，写一篇试试？`,
      hint: "进入创作工作台开始第一篇",
    };
  }

  // 创作者阶段
  if (profile.stage === "creator") {
    return {
      title: "继续创作",
      message: "你已经在创作中了。今天继续打磨，还是拆一篇新小说找灵感？",
      hint: "继续创作，或拆一篇新小说",
    };
  }

  // 默认
  return {
    title: "今天写点什么？",
    message: "可以从拆文开始，也可以直接进入创作——随你。",
    hint: "上传小说拆解，或开始创作",
  };
}
