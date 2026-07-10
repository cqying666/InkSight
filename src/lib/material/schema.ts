import { z } from "zod";

/**
 * 素材库三层结构 Schema (P4-T9)
 *
 * 三层（PRD §5.6）：
 *  - atom   原子素材：一句话 / 场景描写 / 人物设定 / 比喻
 *  - component 组件素材：情节模板 / 冲突模式 / 情绪曲线模板 / 开头钩子模板
 *  - inspiration 灵感素材：跨领域类比 / 视听转译 / "如果…会怎样" 假设
 *
 * 来源（PRD §5.6 + §衔接点表）：
 *  - teardown  拆文自动提取（学→集，全自动，仅 component 层）
 *  - trend     热门元素收藏（察→集，半自动，仅 inspiration 层）
 *  - manual    用户手动收藏 / 创作积累（任意层）
 *  - preset    系统预置
 *
 * 拆文自动提取的 5 类组件（PRD §5.6 拆文自动提取表）：
 *  - hook          开头钩子写法
 *  - reversal      反转节奏模式
 *  - emotion_curve 情绪曲线形状
 *  - character_arc 人物弧光路径
 *  - conflict      冲突层次配置
 */

// ===== 基础枚举 =====

export const MaterialLayer = z.enum([
  "atom",
  "component",
  "inspiration",
]);
export type MaterialLayerValue = z.infer<typeof MaterialLayer>;

export const MaterialSource = z.enum([
  "teardown",
  "trend",
  "manual",
  "preset",
]);
export type MaterialSourceValue = z.infer<typeof MaterialSource>;

/**
 * 组件素材子类型（拆文自动提取的 5 类 + 用户自建通用模板）
 * 仅 component 层使用
 */
export const ComponentKind = z.enum([
  "hook", // 开头钩子写法
  "reversal", // 反转节奏模式
  "emotion_curve", // 情绪曲线形状
  "character_arc", // 人物弧光路径
  "conflict", // 冲突层次配置
  "plot_template", // 情节模板（用户自建/预置）
  "dialogue_pattern", // 对话模式
]);
export type ComponentKindValue = z.infer<typeof ComponentKind>;

// ===== 来源标注 =====

/**
 * 来源作品信息（拆文提取 / 趋势收藏时填充）
 * manual / preset 来源可为空
 */
export const MaterialOrigin = z.object({
  /** 来源作品标题（拆文来自用户上传文件名，趋势来自榜单标题） */
  title: z.string().optional(),
  /** 作品类型（拆文提取时填充） */
  type: z
    .enum(["plot-driven", "emotion-driven", "atmosphere-driven", "mixed"])
    .optional(),
  /** 来源平台（趋势收藏时填充） */
  platform: z
    .enum(["fanqie", "zhihu", "qimao", "dianzhong"])
    .optional(),
  /** 榜单排名（趋势收藏时填充） */
  rank: z.number().int().positive().optional(),
  /** 热度值（趋势收藏时填充） */
  popularity: z.number().nonnegative().optional(),
  /** 拆文报告 ID（拆文提取时填充，便于回溯） */
  reportId: z.string().optional(),
});
export type MaterialOriginValue = z.infer<typeof MaterialOrigin>;

// ===== 三层素材具体结构 =====

/**
 * 原子素材内容
 * 一句话 / 场景描写 / 人物设定 / 比喻
 */
export const AtomContent = z.object({
  /** 素材文本正文 */
  text: z.string().min(1),
  /** 用户自定义标签 */
  tags: z.array(z.string()).default([]),
});
export type AtomContentValue = z.infer<typeof AtomContent>;

/**
 * 组件素材内容
 * 5 类拆文提取 + 2 类通用模板
 */
export const ComponentContent = z.object({
  /** 组件子类型 */
  kind: ComponentKind,
  /** 一句话摘要（列表展示用） */
  summary: z.string().min(1),
  /** 结构化详情（JSON，按 kind 不同字段不同） */
  details: z.record(z.string(), z.unknown()),
  /** 原文摘录（拆文提取时填充，便于参考） */
  excerpt: z.string().optional(),
  /** 用户笔记 */
  notes: z.string().optional(),
  /** 用户自定义标签 */
  tags: z.array(z.string()).default([]),
});
export type ComponentContentValue = z.infer<typeof ComponentContent>;

/**
 * 灵感素材内容
 * 跨领域类比 / 视听转译 / "如果…会怎样" 假设
 */
export const InspirationContent = z.object({
  /** 灵感标题 */
  title: z.string().min(1),
  /** 灵感正文 */
  text: z.string().min(1),
  /** 灵感子类型 */
  kind: z.enum([
    "cross_domain", // 跨领域类比
    "av_transcription", // 视听转译
    "what_if", // "如果…会怎样" 假设
    "other",
  ]),
  /** 关联趋势元素（趋势收藏时填充） */
  trendElement: z.string().optional(),
  /** 用户自定义标签 */
  tags: z.array(z.string()).default([]),
});
export type InspirationContentValue = z.infer<typeof InspirationContent>;

// ===== 完整素材条目 =====

/**
 * 素材条目统一结构
 * 三层共用一张表/集合，通过 layer 字段区分
 */
export const MaterialSchema = z.object({
  /** 素材 ID（uuid 或 slug） */
  id: z.string().min(1),
  /** 所属层 */
  layer: MaterialLayer,
  /** 来源 */
  source: MaterialSource,
  /** 来源标注（teardown/trend 必填，manual/preset 可空） */
  origin: MaterialOrigin.optional(),
  /** 创建时间 ISO */
  createdAt: z.string(),
  /** 更新时间 ISO */
  updatedAt: z.string(),
  /** 所属用户 ID（未登录时为 anonymous-<sessionId>） */
  userId: z.string(),
  /** 文件夹分类（用户自定义） */
  folder: z.string().optional(),
  /** 是否已收藏（收藏 = 进入个人素材库） */
  favorited: z.boolean().default(false),
  /** 三层内容（按 layer 取对应字段） */
  atom: AtomContent.optional(),
  component: ComponentContent.optional(),
  inspiration: InspirationContent.optional(),
});

export type Material = z.infer<typeof MaterialSchema>;

// ===== 校验器 =====

/**
 * 校验素材条目，并保证 layer 与 content 字段一致
 */
export function validateMaterial(data: unknown): {
  success: boolean;
  data?: Material;
  errors?: string[];
} {
  const result = MaterialSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }

  const m = result.data;

  // 层与内容字段一致性校验
  const layerContentErrors: string[] = [];
  if (m.layer === "atom" && !m.atom) {
    layerContentErrors.push("layer=atom 时 atom 字段必填");
  }
  if (m.layer === "component" && !m.component) {
    layerContentErrors.push("layer=component 时 component 字段必填");
  }
  if (m.layer === "inspiration" && !m.inspiration) {
    layerContentErrors.push("layer=inspiration 时 inspiration 字段必填");
  }

  // 来源与 origin 校验：teardown/trend 必须有 origin
  if (
    (m.source === "teardown" || m.source === "trend") &&
    !m.origin
  ) {
    layerContentErrors.push(`source=${m.source} 时 origin 字段必填`);
  }

  // 趋势收藏只能进 inspiration 层
  if (m.source === "trend" && m.layer !== "inspiration") {
    layerContentErrors.push("source=trend 时 layer 必须为 inspiration");
  }

  // 拆文提取只能进 component 层
  if (m.source === "teardown" && m.layer !== "component") {
    layerContentErrors.push("source=teardown 时 layer 必须为 component");
  }

  if (layerContentErrors.length > 0) {
    return { success: false, errors: layerContentErrors };
  }

  return { success: true, data: m };
}

// ===== 辅助：层中文名 =====

export const LAYER_LABEL: Record<MaterialLayerValue, string> = {
  atom: "原子素材",
  component: "组件素材",
  inspiration: "灵感素材",
};

export const SOURCE_LABEL: Record<MaterialSourceValue, string> = {
  teardown: "拆文提取",
  trend: "趋势收藏",
  manual: "手动收藏",
  preset: "系统预置",
};

export const COMPONENT_KIND_LABEL: Record<ComponentKindValue, string> = {
  hook: "开头钩子写法",
  reversal: "反转节奏模式",
  emotion_curve: "情绪曲线形状",
  character_arc: "人物弧光路径",
  conflict: "冲突层次配置",
  plot_template: "情节模板",
  dialogue_pattern: "对话模式",
};
