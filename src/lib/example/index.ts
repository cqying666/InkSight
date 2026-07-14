import type { AnalysisResult } from "@/lib/analysis/pipeline";
import type { GuideAnalysisResult } from "@/lib/analysis/guide-pipeline";
import { splitParagraphs } from "@/lib/report/session";

export type ExampleStatus = "uploaded" | "analyzed";

export interface ExampleWork {
  id: string;
  title: string;
  text: string;
  paragraphs: string[];
  introSentences: string[];
  genre: string;
  tags: string[];
  status: ExampleStatus;
  reportId?: string;
  analysis?: AnalysisResult;
  /** 导语专项拆解结果（由首页导语分析沉淀而来）*/
  guideAnalysis?: GuideAnalysisResult;
  createdAt: string;
  updatedAt: string;
}

export type ExampleSummary = Omit<ExampleWork, "text" | "paragraphs" | "analysis">;

export function stripFileExtension(fileName?: string): string {
  const normalized = fileName?.trim();
  if (!normalized || normalized === "粘贴文本") return "未命名例文";
  return normalized.replace(/\.[^.]+$/, "") || "未命名例文";
}

export function extractIntroSentences(text: string, limit = 3): string[] {
  const normalized = text.replace(/\r/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [];
  return matches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) =>
      sentence.length > 180 ? `${sentence.slice(0, 179)}…` : sentence
    )
    .slice(0, limit);
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean))
  ).slice(0, 12);
}

export function createExample(input: {
  id?: string;
  title?: string;
  text: string;
  genre?: string;
  tags?: string[];
}): ExampleWork {
  const now = new Date().toISOString();
  const text = input.text.trim();
  return {
    id: input.id ?? `example-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: input.title?.trim() || "未命名例文",
    text,
    paragraphs: splitParagraphs(text),
    introSentences: extractIntroSentences(text),
    genre: input.genre?.trim() || "待分类",
    tags: uniqueTags(input.tags ?? []),
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
  };
}

export function enrichExampleWithAnalysis(
  example: ExampleWork,
  analysis: AnalysisResult,
  reportId: string
): ExampleWork {
  const plot = analysis.plot.status === "loaded" ? analysis.plot.data : null;
  const genre =
    plot?.masterTable.genre?.trim() ||
    plot?.editorView.basicInfo.type?.trim() ||
    example.genre;
  const derivedTags = [
    plot?.editorView.basicInfo.type,
    plot?.sixCoreElements.framework.coreAttractionType,
    plot?.creativeAssets.coreGerm.whatItSells,
  ].filter((item): item is string => Boolean(item?.trim()));

  return {
    ...example,
    title:
      example.title === "未命名例文"
        ? plot?.editorView.basicInfo.title?.trim() || example.title
        : example.title,
    genre,
    tags: uniqueTags([...example.tags, ...derivedTags]),
    status: "analyzed",
    reportId,
    analysis,
    updatedAt: new Date().toISOString(),
  };
}

export async function listExamples(): Promise<ExampleSummary[]> {
  const response = await fetch("/api/examples");
  if (!response.ok) throw new Error("例文库加载失败");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("例文库返回格式错误");
  return data;
}

export async function getExample(id: string): Promise<ExampleWork | null> {
  try {
    const response = await fetch(`/api/examples?id=${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    return (await response.json()) as ExampleWork;
  } catch {
    return null;
  }
}

export async function upsertExample(example: ExampleWork): Promise<boolean> {
  try {
    const response = await fetch("/api/examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(example),
    });
    return response.ok;
  } catch {
    return false;
  }
}
