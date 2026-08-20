import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "inksight-coach-sessions-"));
  const originalCwd = process.cwd();
  process.chdir(tempRoot);

  try {
    const { closeDb, getDb } = await import("../src/lib/db/index.ts");
    const {
      branchCoachSession,
      ensureCoachSession,
      readCoachSession,
      replaceCoachMessages,
    } = await import("../src/lib/coach/session-store.ts");

    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("user-a", "user-a", "hash", "experience", now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("user-b", "user-b", "hash", "experience", now, now);

    const primary = ensureCoachSession("user-a", "work-a", [
      { id: "welcome", role: "coach", content: "欢迎" },
      { id: "u-1", role: "user", content: "中段塌了" },
      { id: "c-1", role: "coach", content: "先检查冲突是否升级。" },
    ]);
    assert.equal(primary.session.parentId, null);
    assert.equal(primary.messages.length, 2);
    assert.equal(readCoachSession("user-b", primary.session.id), null);

    const branched = branchCoachSession(
      "user-a",
      primary.session.id,
      "分支 · 留下",
      primary.messages
    );
    assert.ok(branched);
    assert.equal(branched.session.parentId, primary.session.id);
    assert.equal(branched.messages.length, 2);

    const saved = replaceCoachMessages("user-a", branched.session.id, [
      ...branched.messages,
      { id: "u-2", role: "user", content: "如果她留下呢？" },
    ]);
    assert.equal(saved, true);
    assert.equal(readCoachSession("user-a", branched.session.id)?.messages.length, 3);
    assert.equal(readCoachSession("user-b", branched.session.id), null);

    closeDb();
    console.log("coach session tree contract passed");
  } finally {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

void main();
