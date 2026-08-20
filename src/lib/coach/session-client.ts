import type { ChatMessage } from "@/lib/write/coach-context";

export interface CoachSessionSummary {
  id: string;
  workId: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface CoachSessionPayload {
  session: CoachSessionSummary;
  messages: ChatMessage[];
  sessions: CoachSessionSummary[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`会话请求失败 (${response.status})`);
  return response.json() as Promise<T>;
}

export async function ensureCoachSession(
  workId: string,
  seedMessages: ChatMessage[]
): Promise<CoachSessionPayload> {
  return requestJson("/api/coach-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ensure", workId, seedMessages }),
  });
}

export async function loadCoachSession(
  sessionId: string
): Promise<Pick<CoachSessionPayload, "session" | "messages">> {
  return requestJson(`/api/coach-sessions?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function saveCoachSessionMessages(
  sessionId: string,
  messages: ChatMessage[]
): Promise<void> {
  await requestJson("/api/coach-sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, messages }),
  });
}

export async function branchCoachSession(
  sessionId: string,
  messages: ChatMessage[]
): Promise<CoachSessionPayload> {
  const stamp = new Date().toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return requestJson("/api/coach-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "branch",
      sessionId,
      label: `分支 · ${stamp}`,
      messages,
    }),
  });
}
