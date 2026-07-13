/** 创作面板类型 */
export type PanelKey =
  | "draft"
  | "benchmark"
  | "outline"
  | "synopsis"
  | "characters";

export interface CoachReference {
  id: string;
  kind: "document" | "material";
  label: string;
  content: string;
  /** 隐式 RAG 检索的素材（非用户手动勾选） */
  implicit?: boolean;
}

export interface CoachContext {
  title?: string;
  wordCount?: number;
  /** 当前激活的面板，决定 AI 教练的角色与建议方向 */
  activePanel: PanelKey;
  /** 当前面板的完整文本（正文/人物小传/大纲/细纲/对标文） */
  panelContent: string;
  /** 跨面板文档 + 用户勾选素材 + 隐式检索素材 */
  references: CoachReference[];
}

/** 对话消息（半隔离：每个面板独立维护） */
export interface ChatMessage {
  id: string;
  role: "user" | "coach";
  content: string;
}
