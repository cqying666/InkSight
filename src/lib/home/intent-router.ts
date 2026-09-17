/**
 * 首页自然语言意图路由。
 *
 * 只做确定性解析，不调用 LLM：显式意图优先，内容长度仅作兜底。
 * 上传文件的正文天然与输入框指令分离；纯文本输入则识别常见的
 * “指令：正文”或“指令段落 + 正文段落”格式。
 */

export type HomeIntent =
  | "full_teardown"
  | "guide_analysis"
  | "guide_analysis_with_directions"
  | "guide_generation"
  | "unknown";

export interface HomeIntentFile {
  name: string;
  text: string;
}

export interface HomeIntentDecision {
  intent: HomeIntent;
  instruction: string;
  content: string;
  contentSource: "files" | "prompt" | "none";
  reason: string;
}

const ANALYSIS_CUES = /(拆解|拆文|分析|诊断|点评|解构|拆一拆)/;
const GUIDE_CUES = /(导语|开头|开篇|开场|钩子)/;
const FULL_TEXT_CUES = /(全文|全篇|整篇|完整(?:地|的)?(?:拆解|拆文|分析)|小说正文|全文拆解)/;
const DIRECTION_CUES =
  /(二创|仿写|改写方向|改写思路|创作方向|新故事方向|新文方向|衍生方向|可迁移|可复用|举一反三)/;
const GUIDE_GENERATION_CUES =
  /(?:(?:生成|创作|写|产出|给我).{0,16}(?:导语|开头|开篇|钩子)|(?:导语|开头|开篇|钩子).{0,12}(?:生成|创作|写|产出))/;

function hasInstructionCue(value: string): boolean {
  return (
    ANALYSIS_CUES.test(value) ||
    GUIDE_CUES.test(value) ||
    FULL_TEXT_CUES.test(value) ||
    DIRECTION_CUES.test(value) ||
    GUIDE_GENERATION_CUES.test(value)
  );
}

export function splitInstructionAndContent(prompt: string): {
  instruction: string;
  content: string;
  separated: boolean;
} {
  const trimmed = prompt.trim();
  if (!trimmed) return { instruction: "", content: "", separated: false };

  // “请分析导语「正文」并给二创方向”。只在引号外仍存在指令词时切分。
  const quotedMatch = trimmed.match(/[「“"]([^」”"]{30,2000})[」”"]/);
  if (quotedMatch) {
    const instruction = trimmed.replace(quotedMatch[0], "").trim();
    if (hasInstructionCue(instruction)) {
      return {
        instruction,
        content: quotedMatch[1].trim(),
        separated: true,
      };
    }
  }

  // 最常见格式：“请分析以下导语并给二创方向：正文”。
  const colonIndex = trimmed.search(/[：:]/);
  if (colonIndex > 0) {
    const prefix = trimmed.slice(0, colonIndex).trim();
    const suffix = trimmed.slice(colonIndex + 1).trim();
    if (prefix.length <= 240 && suffix.length >= 30 && hasInstructionCue(prefix)) {
      return { instruction: prefix, content: suffix, separated: true };
    }
  }

  // “指令段落\n\n正文”。
  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length >= 2) {
    const first = paragraphs[0].trim();
    const rest = paragraphs.slice(1).join("\n\n").trim();
    if (first.length <= 240 && rest.length >= 30 && hasInstructionCue(first)) {
      return { instruction: first, content: rest, separated: true };
    }
  }

  // “指令行\n正文”。
  const firstLineBreak = trimmed.indexOf("\n");
  if (firstLineBreak > 0) {
    const first = trimmed.slice(0, firstLineBreak).trim();
    const rest = trimmed.slice(firstLineBreak + 1).trim();
    if (first.length <= 240 && rest.length >= 30 && hasInstructionCue(first)) {
      return { instruction: first, content: rest, separated: true };
    }
  }

  return { instruction: trimmed, content: trimmed, separated: false };
}

export function decideHomeIntent(input: {
  prompt: string;
  files?: HomeIntentFile[];
}): HomeIntentDecision {
  const prompt = input.prompt.trim();
  const files = input.files?.filter((file) => file.text.trim()) ?? [];
  const split = splitInstructionAndContent(prompt);
  const fileContent = files.map((file) => file.text.trim()).join("\n\n---\n\n");
  const content = fileContent || split.content;
  const instruction = fileContent ? prompt : split.instruction;
  const contentSource = fileContent ? "files" : content ? "prompt" : "none";

  const wantsAnalysis = ANALYSIS_CUES.test(instruction || prompt);
  const wantsGuide = GUIDE_CUES.test(instruction || prompt);
  const wantsFullText = FULL_TEXT_CUES.test(instruction || prompt);
  const wantsDirections = DIRECTION_CUES.test(instruction || prompt);
  const wantsGuideGeneration = GUIDE_GENERATION_CUES.test(instruction || prompt);

  // “写/生成导语”与“分析/拆解导语”是两个产品能力；分析词存在时后者优先。
  if (wantsGuideGeneration && !wantsAnalysis) {
    return {
      intent: "guide_generation",
      instruction,
      content: split.separated ? split.content : prompt,
      contentSource: prompt ? "prompt" : "none",
      reason: "检测到明确的导语生成意图",
    };
  }

  if (wantsGuide && wantsDirections) {
    return {
      intent: "guide_analysis_with_directions",
      instruction,
      content,
      contentSource,
      reason: "检测到导语分析与二创方向的组合意图",
    };
  }

  if (wantsFullText) {
    return {
      intent: "full_teardown",
      instruction,
      content,
      contentSource,
      reason: "检测到明确的全文拆解意图",
    };
  }

  if (wantsGuide && wantsAnalysis) {
    return {
      intent: "guide_analysis",
      instruction,
      content,
      contentSource,
      reason: "检测到明确的导语分析意图",
    };
  }

  // 文件上传保持历史默认：没有特殊导语指令时执行全文拆文。
  if (fileContent) {
    return {
      intent: "full_teardown",
      instruction,
      content,
      contentSource,
      reason: "上传文件未指定其他意图，沿用全文拆文默认行为",
    };
  }

  // 明确要求分析但未声明内容类型时，以 2000 字作为导语管线的硬边界。
  if (wantsAnalysis && split.separated) {
    return {
      intent: content.length <= 2_000 ? "guide_analysis" : "full_teardown",
      instruction,
      content,
      contentSource,
      reason:
        content.length <= 2_000
          ? "未声明内容类型，按导语长度边界进入轻量分析"
          : "未声明内容类型，正文超过导语上限，进入全文拆文",
    };
  }

  return {
    intent: "unknown",
    instruction,
    content,
    contentSource,
    reason: "未检测到可安全自动执行的明确意图",
  };
}
