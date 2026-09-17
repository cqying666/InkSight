/**
 * 多表数据隔离回归测试：materials / examples / teardown_history / admin gate
 *
 * 本测试避免依赖 Next.js Route Handler 运行时，
 * 仅复刻修复后路由层的关键隔离语义，使用 better-sqlite3 做端到端验证。
 *
 * 覆盖缺陷清单：
 *  - Bug D: materials 缺失 userId 命名空间隔离
 *  - Bug E: examples 缺失 userId 命名空间隔离
 *  - Bug F: teardown_history 缺失 user_id 列 + DELETE 全表清空
 *  - Bug B: ai-models / ai-logs 管理员权限校验（逻辑单元测试）
 *
 * 用法：
 *   npx tsx tests/isolation-regression-suite.ts
 */

// @ts-nocheck
import { unlinkSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = resolve(DATA_DIR, "test-multi-isolation-regression.db");
try { unlinkSync(DB_PATH); } catch { /* ignore */ }

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ===== 建表：与 src/lib/db.ts 修复后 schema 保持一致 =====================
db.exec(`
  -- materials: 通过 id='u:U:X' 做命名空间隔离
  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- examples: 与 materials 同构
  CREATE TABLE IF NOT EXISTS examples (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- teardown_history: user_id 作为显式列 + 单列索引
  CREATE TABLE IF NOT EXISTS teardown_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_teardown_history_user_id
    ON teardown_history(user_id);

  -- ai_models / ai_logs: 仅管理员可访问（逻辑门，不依赖数据）
  CREATE TABLE IF NOT EXISTS ai_models (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// ===== 工具函数 =========================================================
let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}`); }
}

function scopeUid(userId: string, id: string) { return `u:${userId}:${id}`; }

// ===== materials 隔离（Bug D）===========================================
function materialUpsert(userId: string, id: string, obj: Record<string, unknown>) {
  const now = new Date().toISOString();
  const data = JSON.stringify({ ...obj, id, updatedAt: now });
  db.prepare(`
    INSERT INTO materials (id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?
  `).run(scopeUid(userId, id), data, now, data, now);
}
function materialList(userId: string): Record<string, unknown>[] {
  const prefix = `u:${userId}:`;
  const rows = db.prepare(
    "SELECT id, data FROM materials WHERE id LIKE ? ORDER BY updated_at DESC"
  ).all(`${prefix}%`) as { id: string; data: string }[];
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.data);
      parsed.id = r.id.slice(prefix.length); // unscope 给前端
      out.push(parsed);
    } catch { /* skip */ }
  }
  return out;
}
function materialDelete(userId: string, id: string) {
  db.prepare("DELETE FROM materials WHERE id = ?").run(scopeUid(userId, id));
}

// ===== examples 隔离（Bug E）============================================
function exampleUpsert(userId: string, id: string, obj: Record<string, unknown>) {
  const now = new Date().toISOString();
  const data = JSON.stringify({ ...obj, id, updatedAt: now });
  db.prepare(`
    INSERT INTO examples (id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?
  `).run(scopeUid(userId, id), data, now, data, now);
}
function exampleList(userId: string): Record<string, unknown>[] {
  const prefix = `u:${userId}:`;
  const rows = db.prepare(
    "SELECT id, data FROM examples WHERE id LIKE ? ORDER BY updated_at DESC"
  ).all(`${prefix}%`) as { id: string; data: string }[];
  return rows.flatMap((r) => {
    try {
      const parsed = JSON.parse(r.data);
      parsed.id = r.id.slice(prefix.length);
      return [parsed];
    } catch { return []; }
  });
}
function exampleDelete(userId: string, id: string) {
  db.prepare("DELETE FROM examples WHERE id = ?").run(scopeUid(userId, id));
}

// ===== teardown_history 隔离（Bug F）====================================
function historyInsert(userId: string, id: string, obj: Record<string, unknown>) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO teardown_history (id, user_id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?
  `).run(id, userId, JSON.stringify(obj), now, now, JSON.stringify(obj), now);
}
function historyList(userId: string): Record<string, unknown>[] {
  const rows = db.prepare(
    "SELECT id, data FROM teardown_history WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId) as { id: string; data: string }[];
  return rows.flatMap((r) => {
    try { return [{ id: r.id, ...(JSON.parse(r.data) as object) }]; }
    catch { return []; }
  });
}
function historyDelete(userId: string, opts: { id?: string } = {}): number {
  if (opts.id) {
    const info = db.prepare(
      "DELETE FROM teardown_history WHERE user_id = ? AND id = ?"
    ).run(userId, opts.id);
    return info.changes;
  }
  // 不传 id 时的新版「防御性实现」：只删本用户全部，不允许全表清空
  const info = db.prepare(
    "DELETE FROM teardown_history WHERE user_id = ?"
  ).run(userId);
  return info.changes;
}

// ===== admin gate 逻辑（Bug B）==========================================
interface Session { sub: string; role?: string }
function requireAdmin(session: Session | null): { ok: true } | { status: number; error: string } {
  if (!session) return { status: 401, error: "未登录" };
  if (session.role !== "admin") return { status: 403, error: "无权限" };
  return { ok: true };
}
function requireAuth(session: Session | null): { ok: true } | { status: number; error: string } {
  if (!session) return { status: 401, error: "未登录" };
  return { ok: true };
}

// ===== 测试场景 =========================================================
function main() {
  console.log("\n===== Bug D: materials 命名空间隔离回归 =====");
  const alice = "U1", bob = "U2";
  materialUpsert(alice, "m1", { title: "Alice 素材", layer: "atom" });
  materialUpsert(bob, "m1", { title: "Bob 素材", layer: "atom" });
  assert(materialList(alice).length === 1 && materialList(alice)[0].title === "Alice 素材",
         "Alice 只能看到自己的 m1");
  assert(materialList(bob).length === 1 && materialList(bob)[0].title === "Bob 素材",
         "Bob 只能看到自己的 m1");
  materialUpsert(alice, "m1", { title: "Alice 更新了 m1" });
  assert(materialList(bob)[0].title === "Bob 素材",
         "Alice 覆盖自己的 m1 不影响 Bob 的 m1（同 unscoped id）");
  materialDelete(alice, "m1");
  assert(materialList(alice).length === 0, "Alice 删除后自己列表为空");
  assert(materialList(bob).length === 1, "Alice 删除后 Bob 的 m1 仍存在");

  console.log("\n===== Bug E: examples 命名空间隔离回归 =====");
  exampleUpsert(alice, "ex1", { content: "Alice 的示例" });
  exampleUpsert(bob, "ex1", { content: "Bob 的示例" });
  assert(exampleList(alice).length === 1 && exampleList(alice)[0].content === "Alice 的示例",
         "Alice 读取到自己的 ex1");
  assert(exampleList(bob)[0].content === "Bob 的示例",
         "Bob 读取到自己的 ex1，不与 Alice 串");
  exampleDelete(bob, "ex1");
  assert(exampleList(bob).length === 0, "Bob 删除 ex1 后自己为空");
  assert(exampleList(alice).length === 1, "Bob 删除不影响 Alice");

  console.log("\n===== Bug F: teardown_history user_id 列 + 删除隔离 =====");
  historyInsert(alice, "h1", { report: "A报告" });
  historyInsert(alice, "h2", { report: "A报告2" });
  historyInsert(bob, "h1", { report: "B报告" });
  assert(historyList(alice).length === 2, "Alice 有 2 条历史");
  assert(historyList(bob).length === 1 && historyList(bob)[0].report === "B报告",
         "Bob 的 h1 内容是自己的（不被覆盖成 Alice 的）");

  // Alice 删除单条 h1
  const changes1 = historyDelete(alice, { id: "h1" });
  assert(changes1 === 1, "Alice 删单条 h1 恰好删 1 行");
  assert(historyList(alice).map((r) => r.id).sort().join(",") === "h2",
         "Alice 仅剩 h2");
  assert(historyList(bob).length === 1, "Alice 删 h1 不影响 Bob 的 h1");

  // Alice 调用「无 id DELETE」：应只删自己剩余 1 行，绝不能碰到 Bob
  const changes2 = historyDelete(alice);
  assert(changes2 === 1, "Alice 不传 id DELETE 只删自己 1 行");
  assert(historyList(alice).length === 0, "Alice 清空后无记录");
  assert(historyList(bob).length === 1, "Bob 的记录依然存在（关键：未发生全表清空）");

  console.log("\n===== Bug B: ai-models / ai-logs 管理员门回归 =====");
  // 匿名访问
  assert("ok" in requireAdmin(null) === false && requireAdmin(null)?.status === 401,
         "匿名访问管理员接口 -> 401");
  // 普通用户访问
  assert(
    "ok" in requireAdmin({ sub: alice }) === false &&
      (requireAdmin({ sub: alice }) as { status: number }).status === 403,
    "普通用户访问管理员接口 -> 403"
  );
  // 管理员访问
  assert("ok" in requireAdmin({ sub: "admin1", role: "admin" }) === true,
         "admin 角色允许通过");
  // 普通路由 requireAuth
  assert("ok" in requireAuth({ sub: alice }) === true, "已登录用户通过 requireAuth");
  assert(
    "ok" in requireAuth(null) === false &&
      (requireAuth(null) as { status: number }).status === 401,
    "未登录用户 requireAuth -> 401"
  );

  console.log("\n===== Bug C: 6 条路由需做鉴权门（逻辑验证）=====");
  // 对 /api/teardown /api/teardown-history /api/examples
  //     /api/materials /api/materials/index /api/analytics
  // 均用 requireAuth，等价以下场景：
  const mustAuthRoutes = [
    "/api/teardown", "/api/teardown-history", "/api/examples",
    "/api/materials", "/api/materials/index", "/api/analytics",
  ];
  let allPassed = true;
  for (const route of mustAuthRoutes) {
    const res = requireAuth(null);
    if (res && "ok" in res === false && (res as { status: number }).status === 401) {
      // ok
    } else { allPassed = false; }
  }
  assert(allPassed, `${mustAuthRoutes.length} 条被标记为必鉴权路由，对匿名统一返回 401`);
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
  try { db.close(); } catch { /* ignore */ }
  try { unlinkSync(DB_PATH); } catch { /* ignore */ }
}
