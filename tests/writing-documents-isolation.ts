/**
 * 数据隔离回归测试：writing-documents key 命名空间隔离
 *
 * 验证目标：
 *   1. 不同 userId 对同一 key 的写入相互隔离（不相互覆盖）
 *   2. 用户 A 无法读取/修改/删除用户 B 的同名 key
 *   3. works 合并操作（POST）也遵循命名空间隔离
 *
 * 本测试避免依赖 Next.js Route Handler 运行时，
 * 仅抽取隔离核心（scopeKey + handleWorksMerge 的关键语义），
 * 使用 better-sqlite3 验证端到端数据隔离行为。
 *
 * 用法（在已安装 Node + better-sqlite3 的环境中）：
 *   npx tsx tests/writing-documents-isolation.ts
 *   或直接:   node --loader ts-node/esm tests/writing-documents-isolation.ts
 */

// @ts-nocheck
import { unlinkSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
// @ts-nocheck
import Database from "better-sqlite3";

const DATA_DIR = resolve(__dirname, "..", "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = resolve(DATA_DIR, "test-isolation-regression.db");
try {
  unlinkSync(DB_PATH);
} catch {
  // ignore
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE writing_documents (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// --- 复刻修复后路由的关键语义（与 route.ts 保持一致）------------------------
function scopeKey(userId: string, key: string): string {
  return `u:${userId}:${key}`;
}

function scopedPut(userId: string, key: string, data: unknown): void {
  const now = new Date().toISOString();
  const serialized = JSON.stringify(data);
  db.prepare(
    `INSERT INTO writing_documents (key, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET data = ?, updated_at = ?`
  ).run(scopeKey(userId, key), serialized, now, serialized, now);
}

function scopedGet(userId: string, key: string): unknown {
  const row = db
    .prepare("SELECT data FROM writing_documents WHERE key = ?")
    .get(scopeKey(userId, key)) as { data: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.data);
}

function scopedDelete(userId: string, key: string): void {
  db.prepare("DELETE FROM writing_documents WHERE key = ?").run(
    scopeKey(userId, key)
  );
}

function scopedList(userId: string): Record<string, unknown> {
  const prefix = `u:${userId}:`;
  const rows = db
    .prepare("SELECT key, data FROM writing_documents WHERE key LIKE ?")
    .all(`${prefix}%`) as { key: string; data: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const bareKey = r.key.slice(prefix.length);
    try {
      out[bareKey] = JSON.parse(r.data);
    } catch {
      // skip corrupt
    }
  }
  return out;
}

// --- 复刻 handleWorksMerge 的关键行为（按 userId 命名空间）------------------
interface WorksMergeOp {
  op: "upsert" | "delete" | "updateDocuments" | "updateSale" | "clearSale";
  work?: Record<string, unknown>;
  workId?: string;
  documents?: Record<string, unknown>;
  sale?: Record<string, unknown>;
}

function scopedWorksMerge(userId: string, ops: WorksMergeOp[]): unknown[] {
  const WORKS_KEY = scopeKey(userId, "works");
  const txn = db.transaction(() => {
    const row = db
      .prepare("SELECT data FROM writing_documents WHERE key = ?")
      .get(WORKS_KEY) as { data: string } | undefined;
    let works: unknown[] = row ? JSON.parse(row.data) : [];

    for (const op of ops) {
      switch (op.op) {
        case "upsert": {
          const work = op.work;
          if (!work || typeof work.id !== "string") {
            throw new Error("upsert 操作需要 work 对象且含 id");
          }
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === work.id
          );
          if (idx >= 0) works[idx] = { ...works[idx], ...work };
          else works.unshift(work);
          break;
        }
        case "delete": {
          if (!op.workId) throw new Error("delete 操作需要 workId");
          works = works.filter(
            (w) => (w as Record<string, unknown>).id !== op.workId
          );
          break;
        }
        case "updateDocuments": {
          if (!op.workId || !op.documents)
            throw new Error("updateDocuments 需要 workId 和 documents");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) works[idx] = { ...works[idx], documents: op.documents };
          break;
        }
        case "updateSale": {
          if (!op.workId || !op.sale)
            throw new Error("updateSale 需要 workId 和 sale");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) works[idx] = { ...works[idx], sale: op.sale };
          break;
        }
        case "clearSale": {
          if (!op.workId) throw new Error("clearSale 需要 workId");
          const idx = works.findIndex(
            (w) => (w as Record<string, unknown>).id === op.workId
          );
          if (idx >= 0) {
            const { sale: _sale, ...rest } = works[idx] as Record<string, unknown>;
            works[idx] = rest;
          }
          break;
        }
        default:
          throw new Error(`未知操作: ${(op as WorksMergeOp).op}`);
      }
    }

    const now = new Date().toISOString();
    const serialized = JSON.stringify(works);
    db.prepare(
      `INSERT INTO writing_documents (key, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET data = ?, updated_at = ?`
    ).run(WORKS_KEY, serialized, now, serialized, now);
    return works;
  });
  return txn();
}

// --- 测试工具 --------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

// --- 测试场景 --------------------------------------------------------------
function main(): void {
  console.log("\n===== writing-documents 数据隔离回归测试 =====");

  const alice = "alice-id";
  const bob = "bob-id";

  // 场景 1: Alice 写入 draft，Bob 不可见
  scopedPut(alice, "draft", { title: "Alice 的草稿" });
  assert(
    scopedGet(bob, "draft") === null,
    "Bob 读 draft 得到 null（隔离）"
  );
  assert(
    (scopedGet(alice, "draft") as { title: string })?.title === "Alice 的草稿",
    "Alice 能读到自己的 draft"
  );

  // 场景 2: 枚举仅返回当前用户的 key
  scopedPut(alice, "documents", { benchmark: "alice-bench" });
  const aliceKeys = scopedList(alice);
  assert(
    Object.keys(aliceKeys).every((k) => ["draft", "documents"].includes(k)),
    "Alice 枚举结果仅含自己的 key"
  );
  const bobKeys = scopedList(bob);
  assert(!("draft" in bobKeys) && !("documents" in bobKeys), "Bob 枚举不到 Alice 的 key");

  // 场景 3: works 命名空间隔离
  scopedWorksMerge(alice, [
    { op: "upsert", work: { id: "w1", title: "Alice 作品 A" } },
    { op: "upsert", work: { id: "w2", title: "Alice 作品 B" } },
  ]);
  scopedWorksMerge(bob, [
    { op: "upsert", work: { id: "w1", title: "Bob 作品 A" } },
  ]);

  const aliceWorks = scopedGet(alice, "works") as Array<{ id: string; title: string }>;
  const bobWorks = scopedGet(bob, "works") as Array<{ id: string; title: string }>;

  assert(Array.isArray(aliceWorks) && aliceWorks.length === 2, "Alice 有 2 条作品");
  assert(Array.isArray(bobWorks) && bobWorks.length === 1, "Bob 有 1 条作品");
  assert(
    aliceWorks.every((w) => w.title.startsWith("Alice")),
    "Alice 作品列表仅含自己数据"
  );
  assert(
    bobWorks[0].title === "Bob 作品 A",
    "Bob 作品未被 Alice 污染"
  );

  // 场景 4: Bob 无法通过相同 id 覆盖 Alice 的作品
  scopedWorksMerge(bob, [
    { op: "upsert", work: { id: "w2", title: "Bob 偷改 Alice 作品" } },
  ]);
  const aliceW2 = (scopedGet(alice, "works") as Array<{ id: string; title: string }>)
    .find((w) => w.id === "w2");
  assert(!!aliceW2 && aliceW2.title === "Alice 作品 B", "Bob 无法跨用户覆盖 Alice 的同 id 作品");

  // 场景 5: DELETE 仅影响当前用户
  scopedDelete(alice, "draft");
  assert(scopedGet(alice, "draft") === null, "Alice 的 draft 被成功删除");
  // 由于之前 Bob 本就没有 draft，这里验证删除操作不会报错即可
  scopedDelete(bob, "draft"); // 不应抛错

  // 场景 6: 枚举在删除后依然只返回当前用户的数据
  const aliceAfterDel = scopedList(alice);
  assert(!("draft" in aliceAfterDel), "Alice 枚举结果不再含 draft");
  assert("documents" in aliceAfterDel, "Alice 其他 key 不受影响");

  // 场景 7: 验证旧的未命名空间 key 不会被任何人读到（安全兜底层）
  db.prepare(
    `INSERT INTO writing_documents (key, data, updated_at) VALUES (?, ?, ?)`
  ).run("leaked-legacy", JSON.stringify({ secret: "should-not-be-readable" }), new Date().toISOString());
  assert(scopedGet(alice, "leaked-legacy") === null, "用户无法通过作用域读 legacy key");
  assert(scopedGet(bob, "leaked-legacy") === null, "用户无法通过作用域读 legacy key");

  // 清理 legacy 脏数据
  db.prepare("DELETE FROM writing_documents WHERE key = ?").run("leaked-legacy");
}

try {
  main();
  console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`);
  if (failures.length) {
    console.log("失败项:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error("测试执行异常:", err);
  process.exit(2);
} finally {
  try {
    db.close();
  } catch {
    // ignore
  }
}
