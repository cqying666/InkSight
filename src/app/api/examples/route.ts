import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractIntroSentences, type ExampleWork } from "@/lib/example";

function isExampleWork(value: unknown): value is ExampleWork {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExampleWork>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.text === "string" &&
    item.text.length <= 200_000 &&
    Array.isArray(item.paragraphs) &&
    Array.isArray(item.introSentences) &&
    Array.isArray(item.tags) &&
    (item.status === "uploaded" ||
      (item.status === "analyzed" &&
        typeof item.reportId === "string" &&
        (Boolean(item.analysis) || Boolean(item.guideAnalysis))))
  );
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const row = db.prepare("SELECT data FROM examples WHERE id = ?").get(id) as
      | { data: string }
      | undefined;
    if (!row) {
      return NextResponse.json({ error: "例文不存在" }, { status: 404 });
    }
    return NextResponse.json(JSON.parse(row.data));
  }

  const rows = db
    .prepare("SELECT data FROM examples ORDER BY updated_at DESC")
    .all() as { data: string }[];
  const summaries = rows.map((row) => {
    const stored = JSON.parse(row.data) as ExampleWork;
    const { text: _text, paragraphs: _paragraphs, analysis: _analysis, ...summary } =
      stored;
    return {
      ...summary,
      introSentences: extractIntroSentences(stored.text),
    };
  });
  return NextResponse.json(summaries);
}

export async function POST(request: NextRequest) {
  const example = await request.json();
  if (!isExampleWork(example)) {
    return NextResponse.json({ error: "例文数据不完整" }, { status: 400 });
  }
  const normalized: ExampleWork = {
    ...example,
    introSentences: extractIntroSentences(example.text),
  };
  const data = JSON.stringify(normalized);
  const db = getDb();
  db.prepare(
    `INSERT INTO examples (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(normalized.id, data, normalized.updatedAt);
  return NextResponse.json({ success: true });
}
