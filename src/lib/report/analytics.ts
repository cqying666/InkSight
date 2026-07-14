/**
 * 用户行为埋点
 *
 * 从 localStorage 迁移到 SQLite（通过 /api/analytics API）。
 * trackEvent 保持同步（推入内存 buffer），debounce 500ms 批量 POST 到 API。
 * peekEvents/drainEvents 改为 async。
 */

export type AnalyticsEventName =
  | "novel_uploaded"
  | "analysis_completed"
  | "suggestion_adopted"
  | "material_auto_extracted"
  | "material_saved"
  | "material_inserted"
  | "material_searched"
  | "material_deleted"
  | "trend_viewed"
  | "trend_element_saved"
  | "writing_started"
  | "outline_created"
  | "draft_completed"
  | "draft_saved"
  | "material_deposit_confirmed"
  | "material_deposit_skipped"
  | "report_exported"
  | "report_rated"
  | "report_viewed"
  | "file_uploaded"
  | "file_parse_failed"
  | "upload_submitted"
  | "analysis_failed"
  | "analysis_retry"
  | "analysis_auto_retry"
  | "report_demo_viewed"
  | "material_extract_failed"
  | "example_save_failed"
  | "write_entered"
  | "write_focus_mode_toggled"
  | "write_analyzed"
  | "write_outline_created"
  | "trend_classified"
  | "trend_rated"
  | "material_rated"
  | "write_rated"
  | "write_view_changed"
  | "coach_message_sent"
  | "coach_text_inserted"
  | "stuck_bubble_shown"
  | "guide_analysis_completed"
  | "guide_analysis_failed"
  | "guide_analysis_saved_to_material"
  | "stuck_bubble_clicked"
  | "newcomer_guide_dismissed"
  | "works_viewed"
  | "work_deleted"
  | "work_exported"
  | "work_opened"
  | "work_marked_sold"
  | "work_sale_cleared"
  | "ai_control_viewed"
  | "generation_adopted"
  | "generation_discarded";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  ts: string;
  sid: string;
  props: Record<string, unknown>;
}

const SID_KEY = "inksight:sid";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let sid = sessionStorage.getItem(SID_KEY);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    sessionStorage.setItem(SID_KEY, sid);
  }
  return sid;
}

// ===== in-memory buffer + debounce flush =====

const buffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
const FLUSH_DELAY = 500;

function scheduleFlush(): void {
  if (typeof window === "undefined") return;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushToServer();
  }, FLUSH_DELAY);
}

async function flushToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (flushing) return;
  if (buffer.length === 0) return;
  flushing = true;
  const batch = [...buffer];
  buffer.length = 0;
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // 失败时把事件放回 buffer，下次 flush 重试
    buffer.unshift(...batch);
  } finally {
    flushing = false;
  }
}

/** 页面卸载前用 sendBeacon 立即 flush */
function flushOnUnload(): void {
  if (typeof window === "undefined") return;
  if (buffer.length === 0) return;
  const batch = [...buffer];
  buffer.length = 0;
  const blob = new Blob([JSON.stringify({ events: batch })], {
    type: "application/json",
  });
  navigator.sendBeacon("/api/analytics", blob);
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      flushOnUnload();
    }
  });
  window.addEventListener("beforeunload", flushOnUnload);
}

function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    ) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === "object" ? String(x) : x));
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * 记录事件。永不抛错，绝不阻塞主流程。
 * 推入 in-memory buffer，500ms 后批量 POST 到 /api/analytics
 */
export function trackEvent(
  name: AnalyticsEventName,
  props: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const event: AnalyticsEvent = {
      name,
      ts: new Date().toISOString(),
      sid: getSessionId(),
      props: sanitizeProps(props),
    };
    buffer.push(event);
    scheduleFlush();
  } catch {
    // 静默
  }
}

/**
 * 读取已积累的事件（从 SQLite 读取，合并内存 buffer）
 */
export async function peekEvents(): Promise<AnalyticsEvent[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/analytics");
    if (!res.ok) return buffer.length > 0 ? [...buffer] : [];
    const stored = (await res.json()) as AnalyticsEvent[];
    return buffer.length > 0 ? [...stored, ...buffer] : stored;
  } catch {
    return buffer.length > 0 ? [...buffer] : [];
  }
}

/**
 * 读取并清空全部事件
 */
export async function drainEvents(): Promise<AnalyticsEvent[]> {
  if (typeof window === "undefined") return [];
  // 先 flush 待写事件
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  await flushToServer();
  try {
    const res = await fetch("/api/analytics");
    const events = res.ok ? ((await res.json()) as AnalyticsEvent[]) : [];
    await fetch("/api/analytics", { method: "DELETE" });
    return events;
  } catch {
    return [];
  }
}
