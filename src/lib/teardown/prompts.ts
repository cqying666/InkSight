import type { NovelTypeValue } from "./schema";
import { TYPE_WEIGHT_TEMPLATES } from "./schema";

/**
 * Prompt 模块（生产 + 测试共用）
 *
 * 把 prompt 抽到独立模块，保证 tests/consistency-monitor.ts
 * 与 src/lib/teardown 使用完全相同的 prompt
 */

type WeightTemplate = (typeof TYPE_WEIGHT_TEMPLATES)[NovelTypeValue];

// ===== 类型识别 Prompt =====

export const TYPE_DETECTION_PROMPT = {
  system: `你是一位资深短篇小说编辑。你的任务是快速识别短篇小说的驱动类型。

## 类型定义

1. **plot-driven（情节驱动型）**：以事件推进为主，反转密集，节奏快，读者被"接下来发生什么"驱动
2. **emotion-driven（情感驱动型）**：以人物情感变化为主，内心描写多，读者被"角色感受什么"驱动
3. **atmosphere-driven（氛围驱动型）**：以营造氛围意境为主，感官描写丰富，读者被"沉浸感"驱动
4. **mixed（混合型）**：多种驱动均衡，无法明确判断主导类型，或特征不明确

## 输出格式

只输出一个合法 JSON 对象，不要包含 markdown 代码块、不要任何额外文字，直接以 { 开头：

{
  "type": "plot-driven",
  "confidence": 0.85,
  "reasoning": "判断理由（一句话）"
}

type 字段必须是以下四个值之一：plot-driven、emotion-driven、atmosphere-driven、mixed
confidence 字段必须是 0 到 1 之间的数字。

## 注意

- 置信度低于 0.7 时请输出 "mixed"
- 短篇小说通常类型特征鲜明，但有些作品确实均衡
- 禁止使用任何工具，禁止保存文件，直接在回复文本中输出 JSON`,

  user: (novelText: string) => {
    const maxChars = 8_000;
    const text = novelText.slice(0, maxChars);
    return `请识别以下小说的驱动类型，直接在回复文本中输出合法 JSON（不要使用工具，不要保存文件，不要用代码块包装）。\n\n${text}`;
  },
};

// ===== 拆解 Prompt =====

export const TEARDOWN_PROMPT = {
  system: (
    novelType: NovelTypeValue,
    weights: WeightTemplate
  ) => `你是一位资深短篇小说编辑和结构分析专家。你的任务是对短篇小说进行三层 14 维度的结构化拆解。

## 拆解原则

1. **每个维度必须附带原文证据引用**（evidence 字段），引用原文具体段落
2. **数值要精确**：位置用 0-1 的比例值，情绪用 -5 到 +5 的整数值
3. **分析要具体**：不要空泛描述，要指向具体段落和用词
4. **类型识别**：本篇已识别为 ${novelType}，请在 type 字段填入此值
5. **情绪曲线**：选取至少 5 个关键转折点，标注位置和情绪值

## 情绪值标定规范（重要）

情绪值范围 -5 到 +5，**正值=积极情绪，负值=消极情绪，0=中性**：
- +5 = 极度喜悦/幸福/释然
- +3 = 希望/爱/满足
- +1 = 轻微好感/平静
- 0 = 中性
- -1 = 轻微不安/忧郁
- -3 = 恐惧/悲伤/愤怒
- -5 = 极度绝望/崩溃/恐惧

**emotionRange.max = 全文情绪数值最大的点（最积极）**
**emotionRange.min = 全文情绪数值最小的点（最消极）**
注意：悬疑/悲剧小说中，最紧张的段落情绪值可能是 -4，此时 max 可能是 0 或 1（开场相对平静），min 是 -4。不要把"情绪最强烈"等同于"情绪最高"。

## 结局类型判断标准

按以下顺序判断：
1. **twist** = 结局有意外反转，真相与读者预期相反
2. **open** = 故事在悬念中结束，主要冲突未解决
3. **ambiguous** = 给出了结局但意义模糊，可多种解读
4. **circular** = 结局回到开头场景或意象，形成闭环
5. **tragic** = 主角失败/死亡/失去，悲剧收场
6. **happy** = 主角成功/团圆，圆满收场

## 事件密度计数规范

**事件 = 推动情节发展或改变人物状态的独立叙事单元**
- 算作事件：决定、行动、发现、冲突、转折、信息揭露
- 不算事件：纯景物描写、纯心理活动、过渡性叙述
- eventDensity = 事件总数 / (字数/1000)

## 类型权重提示（${novelType}）

${formatWeights(weights)}

## 输出格式

必须输出合法 JSON，结构与以下 schema 一致：

- type: 小说类型（填 "${novelType}"）
- typeConfidence: 类型置信度 0-1
- wordCount: 总字数
- paragraphCount: 总段落数
- skeleton: 骨架层（5维）
  - hookType: 钩子类型 (suspense/action/character/atmosphere/dialogue/mixed)
  - hookStrength: 钩子强度 0-5
  - hookEvidence: 原文证据（≤50字）
  - hookAnalysis: 效果分析（≤80字）
  - threeActRatio: {setup, confrontation, resolution} 各占 0-1
  - reversals: [{position, type, description}] 反转节点数组
  - endingType: 结局类型 — 严格按上述判断标准选择
  - endingAnalysis: 结局分析（≤80字）
  - eventDensity: 每千字事件数 — 严格按上述计数规范
  - eventDensityEvidence: 证据（列出所有事件，≤100字）
- flesh: 血肉层（5维）
  - emotionCurve: [{position, emotion, label}] 至少5个点 — emotion 严格按情绪值标定规范
  - emotionRange: {min, max} — min=最消极值（最小），max=最积极值（最大）
  - emotionTrend: 走势描述（≤50字）
  - dialogueRatio: 对话占比 0-1（对话字数/全文字数，含引号内文字）
  - narrationRatio: 叙述占比 0-1
  - dialogueAnalysis: 对话效果（≤80字）
  - sensoryFrequency: {visual, auditory, tactile, olfactory, gustatory} 各类每千字频率
  - sensoryAnalysis: 感官描写效果（≤80字）
  - characterArc: {desire, obstacle, change, changePoint}（changePoint 必须是 0-1 的数字）
  - conflictLayers: {interpersonal, internal, environmental 各占 0-1, dominantConflict 文字描述}
- style: 风格层（4维）
  - sentenceStyle: {avgLength, shortSentenceRatio, longSentenceRatio, rhythm}
  - wordPreference: {formality, imagery, keyword[]}
  - perspective: 视角 (first/second/third-limited/third-omniscient/mixed)
  - perspectiveAnalysis: 视角效果（≤80字）
  - tense: 时态 (past/present/mixed)
  - tenseAnalysis: 时态效果（≤80字）
- summary: 一句话总评（≤100字）
- keyFindings: 1-3 个核心发现（每个≤50字）

## 输出要求（重要）

1. **直接在回复文本中输出 JSON**，禁止使用任何工具，禁止保存到文件
2. 输出必须是合法 JSON，不要包含注释或额外文字
3. 不要用 markdown 代码块包装，直接以 { 开头输出
4. 文字字段控制在指定字数内，避免输出过长被截断`,

  user: (novelText: string) => {
    const maxChars = 20_000;
    const text =
      novelText.length > maxChars
        ? novelText.slice(0, maxChars) + "\n\n[文本过长，已截断]"
        : novelText;

    return `请对以下短篇小说进行三层 14 维度结构化拆解，直接在回复中输出合法 JSON（不要使用工具，不要保存文件，不要用代码块包装，直接以 { 开头）。

## 小说全文

${text}

## 要求

1. 仔细阅读全文，逐段分析
2. 每个维度的 evidence 字段必须引用原文具体文字
3. 数值要精确，不要随意取整
4. 情绪值严格按标定规范：正值=积极，负值=消极
5. 结局类型严格按判断标准顺序选择
6. 事件密度严格按计数规范计算
7. characterArc.changePoint 必须是 0-1 的数字，不能是文字描述
8. 直接输出 { 开头的 JSON，禁止任何工具调用和文件写入`;
  },
};

/**
 * 格式化权重模板为可读字符串
 */
function formatWeights(weights: WeightTemplate): string {
  const highlight = weights.highlight.length
    ? `重点关注维度: ${weights.highlight.join("、")}`
    : "无特殊重点关注";
  const fold = weights.fold.length
    ? `可简化处理维度: ${weights.fold.join("、")}`
    : "无简化维度";
  return `- ${highlight}\n- ${fold}`;
}
