import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import {
  branchCoachSession,
  ensureCoachSession,
  readCoachSession,
  replaceCoachMessages,
  type StoredCoachMessage,
} from "@/lib/coach/session-store";

const MessageSchema = z.object({
  id: z.string().min(1).max(160),
  role: z.enum(["user", "coach"]),
  content: z.string().min(1).max(12_000),
});
const WorkIdSchema = z.string().min(1).max(160);

const EnsureSchema = z.object({
  action: z.literal("ensure"),
  workId: WorkIdSchema,
  seedMessages: z.array(MessageSchema).max(100).default([]),
});
const BranchSchema = z.object({
  action: z.literal("branch"),
  sessionId: z.string().min(1).max(160),
  label: z.string().min(1).max(80),
  messages: z.array(MessageSchema).max(100),
});
const SessionActionSchema = z.discriminatedUnion("action", [EnsureSchema, BranchSchema]);
const ReplaceSchema = z.object({
  sessionId: z.string().min(1).max(160),
  messages: z.array(MessageSchema).max(100),
});

async function requireUser() {
  const session = await getSession();
  if (!session) return null;
  return session;
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }
  const loaded = readCoachSession(user.sub, sessionId);
  if (!loaded) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json(loaded);
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const parsed = SessionActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "会话请求无效" }, { status: 400 });
  }

  const body = parsed.data;
  if (body.action === "ensure") {
    return NextResponse.json(
      ensureCoachSession(user.sub, body.workId, body.seedMessages as StoredCoachMessage[])
    );
  }

  const created = branchCoachSession(
    user.sub,
    body.sessionId,
    body.label,
    body.messages as StoredCoachMessage[]
  );
  if (!created) return NextResponse.json({ error: "源会话不存在" }, { status: 404 });
  return NextResponse.json(created, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const parsed = ReplaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "消息保存请求无效" }, { status: 400 });
  }
  const ok = replaceCoachMessages(
    user.sub,
    parsed.data.sessionId,
    parsed.data.messages as StoredCoachMessage[]
  );
  if (!ok) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json({ success: true });
}
