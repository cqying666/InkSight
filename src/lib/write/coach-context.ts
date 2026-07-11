export interface CoachReference {
  id: string;
  kind: "document" | "material";
  label: string;
  content: string;
}

export interface CoachContext {
  title?: string;
  wordCount?: number;
  references: CoachReference[];
}
