/**
 * 用户行为埋点 (P2-T9)
 *
 * 对齐 PRD 7.3 关键事件 + 特性表第 10 项（建议采纳/报告导出/评分/素材收藏/趋势关注）。
 *
 * 实现：轻量 localStorage 队列。
 *  - 事件先入队列，便于离线演示与未来批量上报
 *  - 提供 flush() 钩子，后续接入 /api/analytics 时零重构
 *  - SSR 安全（typeof window 检查）
 *  - 失败静默，绝不影响主流程
 */

export type AnalyticsEventName =
  // PRD 7.3
  | "novel_uploaded"
  | "analysis_completed"
  | "suggestion_adopted"
  | "material_auto_extracted"
  | "material_saved"
  | "material_inserted"
  | "material_searched"
  | "trend_viewed"
  | "trend_element_saved"
  | "writing_started"
  | "outline_created"
  | "draft_completed"
  // 特性表第 10 项补充
  | "report_exported"
  | "report_rated"
  | "report_viewed"
  // 解析/降级过程
  | "file_uploaded"
  | "file_parse_failed"
  | "upload_submitted"
  | "analysis_failed"
  | "report_demo_viewed"
  // Phase 5 创作工作台
  | "write_entered"
  | "write_focus_mode_toggled"
  | "write_analyzed"
  | "write_outline_created"
  // Phase 4 趋势采集
  | "trend_classified"
  // Phase 6 P6-T8 各模块评分（覆盖 PRD §6 全模块体验评估）
  | "trend_rated"
  | "material_rated"
  | "write_rated"
  | "write_view_changed"
  | "coach_message_sent";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  /** ISO 时间戳 */
  ts: string;
  /** 匿名会话 ID（每次访问生成，不关联个人身份） */
  sid: string;
  props: Record<string, unknown>;
}

const QUEUE_KEY = "inksight:analytics_queue";
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

function readQueue(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: AnalyticsEvent[]) {
  if (typeof window === "undefined") return;
  try {
    // 上限 500 条，超出丢弃最旧
    const trimmed = events.slice(-500);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // 容量满：丢弃一半再写
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(events.slice(-250))
      );
    } catch {
      // 静默放弃
    }
  }
}

/**
 * P6-T9 性能优化：in-memory buffer + debounce flush
 *
 * 原实现每次 trackEvent 都 readQueue(JSON.parse)→push→writeQueue(JSON.stringify)，
 * 500 条事件体积 50-200KB，高频事件（如写作时）会阻塞主线程。
 *
 * 新实现：
 *  - trackEvent 只推入 in-memory buffer，O(1) 不阻塞
 *  - debounce 500ms 后批量 flush 到 localStorage
 *  - 页面卸载前（visibilitychange/beforeunload）立即 flush 避免丢事件
 *  - peekEvents/drainEvents 合并 buffer + localStorage 保证读一致
 */
const buffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const FLUSH_DELAY = 500;

function scheduleFlush(): void {
  if (typeof window === "undefined") return;
  if (flushTimer) return; // 已有待执行的 flush
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    flushToStorage();
  }, FLUSH_DELAY);
}

function flushToStorage(): void {
  if (typeof window === "undefined") return;
  if (buffer.length === 0) return;
  try {
    const queue = readQueue();
    queue.push(...buffer);
    buffer.length = 0;
    writeQueue(queue);
  } catch {
    // 静默
  }
}

// 页面卸载前立即 flush（避免丢事件）
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      flushToStorage();
    }
  });
  window.addEventListener("beforeunload", flushToStorage);
}

/**
 * 记录事件。永不抛错，绝不阻塞主流程。
 * P6-T9: 推入 in-memory buffer，500ms 后批量 flush 到 localStorage
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
 * 读取已积累的事件（调试/未来上报用）。
 * P6-T9: 合并 in-memory buffer + localStorage 保证读一致
 */
export function drainEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  // 先 flush 待写事件
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  flushToStorage();
  const events = readQueue();
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
  return events;
}

export function peekEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  // 合并 buffer 与 localStorage（buffer 中是尚未 flush 的事件）
  const stored = readQueue();
  return buffer.length > 0 ? [...stored, ...buffer] : stored;
}
