import type { AnalysisResult } from "@/lib/analysis/pipeline";
import type { WriteOutline } from "./outline";

const STORAGE_KEY = "inksight:write:documents";

export type WorkspaceDocumentKey = "benchmark" | "synopsis" | "characters";

export type WorkspaceDocuments = Record<WorkspaceDocumentKey, string>;

export const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceDocuments = {
  benchmark: "",
  synopsis: "",
  characters: "",
};

export function loadWorkspaceDocuments(): WorkspaceDocuments {
  if (typeof window === "undefined") return { ...EMPTY_WORKSPACE_DOCUMENTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_WORKSPACE_DOCUMENTS };
    const parsed = JSON.parse(raw) as Partial<WorkspaceDocuments>;
    return {
      benchmark: parsed.benchmark ?? "",
      synopsis: parsed.synopsis ?? "",
      characters: parsed.characters ?? "",
    };
  } catch {
    return { ...EMPTY_WORKSPACE_DOCUMENTS };
  }
}

export function saveWorkspaceDocuments(documents: WorkspaceDocuments): boolean {
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(documents);
    localStorage.setItem(STORAGE_KEY, serialized);
    return localStorage.getItem(STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}

export function seedDocumentsFromAnalysis(
  current: WorkspaceDocuments,
  analysis: AnalysisResult | undefined,
  paragraphs: string[] = []
): WorkspaceDocuments {
  const next = { ...current };
  if (!next.benchmark && paragraphs.length > 0) {
    next.benchmark = paragraphs.join("\n\n");
  }

  if (!next.characters && analysis?.character.status === "loaded") {
    next.characters = (analysis.character.data?.biographies ?? [])
      .map((item) => `${item.name}（${item.role}）\n${item.biography}`)
      .join("\n\n");
  }

  if (!next.synopsis && analysis?.plot.status === "loaded" && analysis.plot.data) {
    const flow = analysis.plot.data.plotEmotionFlow;
    next.synopsis = [
      ...flow.chaptersBeforePayPoint.map(
        (chapter) =>
          `${chapter.chapter}\n剧情推进：${chapter.overallProgress}\n冲突推进：${chapter.conflictProgress}\n情绪拉扯：${chapter.emotionPull}\n章尾钩子：${chapter.endingHook}`
      ),
      ...flow.chaptersAfterPayPoint.map(
        (chapter) =>
          `${chapter.chapter}\n主要事件：${chapter.mainEvents}\n释放方向：${chapter.releaseDirection}\n章节作用：${chapter.role}`
      ),
    ].join("\n\n");
  }
  return next;
}

export function outlineToCoachText(outline: WriteOutline | null): string {
  if (!outline) return "";
  const reversals = outline.reversals
    .map(
      (item, index) =>
        `反转${index + 1}：全文${Math.round(item.position * 100)}％处，${item.type}，${item.note || "未填写"}`
    )
    .join("\n");
  return [
    `钩子类型：${outline.hookType}`,
    `钩子说明：${outline.hookNote || "未填写"}`,
    `三幕比例：${Math.round(outline.threeActRatio.setup * 100)}％／${Math.round(outline.threeActRatio.confrontation * 100)}％／${Math.round(outline.threeActRatio.resolution * 100)}％`,
    reversals,
    `结局类型：${outline.endingType}`,
    `情绪走势：${outline.emotionGoal.trend || "未填写"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export { STORAGE_KEY as WORKSPACE_DOCUMENTS_KEY };
