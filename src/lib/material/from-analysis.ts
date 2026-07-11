import type { AnalysisResult } from "@/lib/analysis/pipeline";
import type { ComponentKindValue, Material } from "./schema";

export type MaterialCategory = "character" | "plot" | "emotion" | "inspiration";

export interface AnalysisMaterialCandidate {
  id: string;
  category: MaterialCategory;
  categoryLabel: string;
  material: Material;
}

const CATEGORY_LABEL: Record<MaterialCategory, string> = {
  character: "人设",
  plot: "剧情",
  emotion: "情绪描写语录",
  inspiration: "灵感",
};

const CARD_TYPE_MAP: Record<
  string,
  { category: MaterialCategory; kind: ComponentKindValue }
> = {
  coreGerm: { category: "plot", kind: "plot_template" },
  antagonistBehavior: { category: "plot", kind: "conflict" },
  openingScene: { category: "plot", kind: "hook" },
  satisfactionEvent: { category: "plot", kind: "plot_template" },
  characterBuilding: { category: "character", kind: "character_arc" },
  emotionProgress: { category: "emotion", kind: "emotion_curve" },
};

function safeId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

function buildComponentMaterial(input: {
  id: string;
  title: string;
  kind: ComponentKindValue;
  details: Record<string, unknown>;
  tags: string[];
  reportId: string;
  sourceTitle: string;
}): Material {
  const now = new Date().toISOString();
  return {
    id: input.id,
    layer: "component",
    source: "teardown",
    origin: {
      title: input.sourceTitle,
      reportId: input.reportId,
    },
    createdAt: now,
    updatedAt: now,
    userId: "anonymous",
    favorited: false,
    component: {
      kind: input.kind,
      summary: input.title,
      details: input.details,
      tags: input.tags,
    },
  };
}

export function buildAnalysisMaterialCandidates(
  analysis: AnalysisResult,
  reportId = `report-${Date.now()}`
): AnalysisMaterialCandidate[] {
  const candidates: AnalysisMaterialCandidate[] = [];
  const plot = analysis.plot.status === "loaded" ? analysis.plot.data : undefined;
  const character =
    analysis.character.status === "loaded" ? analysis.character.data : undefined;
  const sourceTitle =
    plot?.editorView.basicInfo.title || character?.characterList.bookName || "未命名作品";

  plot?.materialCards.forEach((card, index) => {
    const mapped = CARD_TYPE_MAP[card.cardType] ?? {
      category: "plot" as const,
      kind: "plot_template" as const,
    };
    const details = Object.fromEntries(
      card.fields.map((field) => [field.key, field.value])
    );
    const firstValue = card.fields.find((field) => field.value.trim())?.value;
    const title = firstValue
      ? `${card.cardName}：${firstValue.slice(0, 80)}`
      : card.cardName;
    const id = `analysis-${safeId(reportId)}-${safeId(card.cardType)}-${index}`;
    candidates.push({
      id,
      category: mapped.category,
      categoryLabel: CATEGORY_LABEL[mapped.category],
      material: buildComponentMaterial({
        id,
        title,
        kind: mapped.kind,
        details,
        tags: [CATEGORY_LABEL[mapped.category], card.cardName],
        reportId,
        sourceTitle,
      }),
    });
  });

  character?.reusableCards.forEach((card, index) => {
    const id = `analysis-${safeId(reportId)}-character-${index}`;
    candidates.push({
      id,
      category: "character",
      categoryLabel: CATEGORY_LABEL.character,
      material: buildComponentMaterial({
        id,
        title: `${card.cardName}：${card.oneLineCharacter}`,
        kind: "character_arc",
        details: { ...card },
        tags: ["人设", ...card.suitableGenres.slice(0, 3)],
        reportId,
        sourceTitle,
      }),
    });
  });

  character?.relationships.forEach((relationship, index) => {
    const id = `analysis-${safeId(reportId)}-relationship-${index}`;
    candidates.push({
      id,
      category: "plot",
      categoryLabel: CATEGORY_LABEL.plot,
      material: buildComponentMaterial({
        id,
        title: `${relationship.relationshipName}：${relationship.conflictEngine}`,
        kind: "conflict",
        details: { ...relationship },
        tags: ["剧情", "人物关系", relationship.relationshipName],
        reportId,
        sourceTitle,
      }),
    });
  });

  return candidates;
}

export function createManualMaterial(input: {
  category: MaterialCategory;
  title: string;
  content: string;
  tags?: string[];
  folder?: string;
}): Material {
  const now = new Date().toISOString();
  const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tags = Array.from(
    new Set([CATEGORY_LABEL[input.category], ...(input.tags ?? [])].filter(Boolean))
  );
  const base = {
    id,
    source: "manual" as const,
    createdAt: now,
    updatedAt: now,
    userId: "anonymous",
    folder: input.folder || undefined,
    favorited: true,
  };

  if (input.category === "emotion") {
    return {
      ...base,
      layer: "atom",
      atom: { text: input.content, tags },
    };
  }

  if (input.category === "inspiration") {
    return {
      ...base,
      layer: "inspiration",
      inspiration: {
        title: input.title,
        text: input.content,
        kind: "other",
        tags,
      },
    };
  }

  return {
    ...base,
    layer: "component",
    component: {
      kind: input.category === "character" ? "character_arc" : "plot_template",
      summary: input.title,
      details: { content: input.content },
      notes: input.content,
      tags,
    },
  };
}

export function materialToCoachText(material: Material): string {
  if (material.atom) return material.atom.text;
  if (material.inspiration) {
    return `${material.inspiration.title}：${material.inspiration.text}`;
  }
  if (material.component) {
    const details = Object.entries(material.component.details)
      .slice(0, 8)
      .map(([key, value]) => `${key}：${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join("；");
    return `${material.component.summary}${details ? `。${details}` : ""}`;
  }
  return "";
}
