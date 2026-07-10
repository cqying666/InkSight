/**
 * P5-T1 创作工作台统计工具
 *
 * 字数统计：中文字符 + 英文单词
 * 阅读时长：中文 ~400 字/分钟
 * 段落提取：从 HTML 中提取段落列表（与拆文分析编号体系一致）
 */

const CN_CHARS_PER_MIN = 400;

/**
 * 从纯文本计算字数（中文字符 + 英文单词）
 */
export function countWords(text: string): number {
  if (!text) return 0;
  // 中文字符
  const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文单词（去掉中文后按空格分）
  const enText = text.replace(/[\u4e00-\u9fff]/g, " ").trim();
  const enWords = enText ? enText.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length : 0;
  return cnChars + enWords;
}

/**
 * 预估阅读时长（分钟）
 */
export function estimateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / CN_CHARS_PER_MIN));
}

/**
 * 从 HTML 提取段落列表
 * 章节标题（h2/h3）不计为段落，p 和 div 计为段落
 * 用于 P5-T2 段落编号系统 + P5-T10 写后分析
 */
export function extractParagraphs(html: string): string[] {
  if (!html) return [];
  // 用临时 DOM 解析
  if (typeof document === "undefined") return [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const paragraphs: string[] = [];
  tmp.querySelectorAll("p, div").forEach((el) => {
    const text = el.textContent?.trim();
    if (text) paragraphs.push(text);
  });
  return paragraphs;
}

/**
 * 从 HTML 提取纯文本
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

/**
 * 判断段落类型（用于 P5-T9 实时结构提示）
 * 简单启发式：含引号的为对话，否则为叙述
 */
export function classifyParagraph(text: string): "dialogue" | "narration" | "chapter" {
  if (!text) return "narration";
  // 章节标题
  if (/^第.+[章节]/.test(text) || /^Chapter/i.test(text)) return "chapter";
  // 含中文引号或英文引号
  if (/["""\']/.test(text)) return "dialogue";
  return "narration";
}
