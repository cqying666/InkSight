import { getDb } from "@/lib/db";

export interface CoachSessionSummary {
  id: string;
  workId: string;
  parentId: string | null;
  label: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoredCoachMessage {
  id: string;
  role: "user" | "coach";
  content: string;
}

interface CoachSessionRow {
  id: string;
  work_id: string;
  parent_id: string | null;
  label: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function listSessions(userId: string, workId: string): CoachSessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.work_id, s.parent_id, s.label, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
       FROM coach_sessions s
       LEFT JOIN coach_messages m ON m.session_id = s.id AND m.user_id = s.user_id
       WHERE s.user_id = ? AND s.work_id = ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC`
    )
    .all(userId, workId) as CoachSessionRow[];
  return rows.map((row) => ({
    id: row.id,
    workId: row.work_id,
    parentId: row.parent_id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count) || 0,
  }));
}

export function readCoachSession(
  userId: string,
  sessionId: string
): { session: CoachSessionSummary; messages: StoredCoachMessage[] } | null {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.work_id, s.parent_id, s.label, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
       FROM coach_sessions s
       LEFT JOIN coach_messages m ON m.session_id = s.id AND m.user_id = s.user_id
       WHERE s.user_id = ? AND s.id = ?
       GROUP BY s.id`
    )
    .get(userId, sessionId) as CoachSessionRow | undefined;
  if (!row) return null;

  const messages = getDb()
    .prepare(
      `SELECT id, role, content
       FROM coach_messages
       WHERE user_id = ? AND session_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(userId, sessionId) as StoredCoachMessage[];

  return {
    session: {
      id: row.id,
      workId: row.work_id,
      parentId: row.parent_id,
      label: row.label,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count) || 0,
    },
    messages: messages.filter(
      (message) => message.role === "user" || message.role === "coach"
    ),
  };
}

export function ensureCoachSession(
  userId: string,
  workId: string,
  seedMessages: StoredCoachMessage[]
): {
  session: CoachSessionSummary;
  messages: StoredCoachMessage[];
  sessions: CoachSessionSummary[];
} {
  const existing = getDb()
    .prepare(
      `SELECT id FROM coach_sessions
       WHERE user_id = ? AND work_id = ? AND parent_id IS NULL
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(userId, workId) as { id: string } | undefined;
  if (existing) {
    const loaded = readCoachSession(userId, existing.id);
    if (loaded) {
      return { ...loaded, sessions: listSessions(userId, workId) };
    }
  }

  const now = new Date().toISOString();
  const sessionId = createId("coach");
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO coach_sessions (id, user_id, work_id, parent_id, label, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`
    ).run(sessionId, userId, workId, "主线对话", now, now);
    writeMessages(db, userId, sessionId, seedMessages, now);
  })();

  const created = readCoachSession(userId, sessionId);
  if (!created) throw new Error("创建创作教练会话失败");
  return { ...created, sessions: listSessions(userId, workId) };
}

export function replaceCoachMessages(
  userId: string,
  sessionId: string,
  messages: StoredCoachMessage[]
): boolean {
  const session = readCoachSession(userId, sessionId);
  if (!session) return false;

  const now = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM coach_messages WHERE user_id = ? AND session_id = ?").run(
      userId,
      sessionId
    );
    writeMessages(db, userId, sessionId, messages, now);
    db.prepare("UPDATE coach_sessions SET updated_at = ? WHERE user_id = ? AND id = ?").run(
      now,
      userId,
      sessionId
    );
  })();
  return true;
}

export function branchCoachSession(
  userId: string,
  sourceSessionId: string,
  label: string,
  messages: StoredCoachMessage[]
): {
  session: CoachSessionSummary;
  messages: StoredCoachMessage[];
  sessions: CoachSessionSummary[];
} | null {
  const source = readCoachSession(userId, sourceSessionId);
  if (!source) return null;

  const now = new Date().toISOString();
  const sessionId = createId("coach");
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO coach_sessions (id, user_id, work_id, parent_id, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, userId, source.session.workId, sourceSessionId, label, now, now);
    writeMessages(db, userId, sessionId, messages, now);
  })();

  const created = readCoachSession(userId, sessionId);
  if (!created) throw new Error("创建创作分支失败");
  return { ...created, sessions: listSessions(userId, source.session.workId) };
}

function writeMessages(
  db: ReturnType<typeof getDb>,
  userId: string,
  sessionId: string,
  messages: StoredCoachMessage[],
  createdAt: string
): void {
  const insert = db.prepare(
    `INSERT INTO coach_messages (id, session_id, user_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const message of messages.slice(-100)) {
    if (!message.content.trim() || message.id === "welcome") continue;
    // 前端消息 id 仅是视图 key；持久化记录在每次写入时获得独立 ID，
    // 以便同一条对话安全地复制到任意分支。
    insert.run(createId("msg"), sessionId, userId, message.role, message.content, createdAt);
  }
}
