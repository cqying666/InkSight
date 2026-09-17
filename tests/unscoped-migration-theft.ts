/**
 * 关键缺陷回归测试：unscoped 遗留数据「先到先得」数据盗窃
 *
 * 缺陷描述：
 *   在多用户命名空间（u:userId:key）引入后，GET /api/writing-documents 与
 *   GET /api/materials 为了兼容单用户遗留数据，会在「当前用户无 scoped 数据」时
 *   读取库内全部 unscoped 行并重命名到该用户的命名空间下。
 *
 *   触发条件（具体、可信的场景）：
 *     1. 系统内仍存在 pre-multiusers 时代的 unscoped 遗留数据
 *        （例如 admin 早期创建的作品、草稿、素材）
 *     2. 管理员创建了一个体验账户 experience
 *     3. 体验账户 Alice 在管理员登录并访问写作文档/素材页之前，
 *        先一步在浏览器打开了工作台（触发 GET /api/writing-documents 列表）
 *        或素材库（触发 GET /api/materials 列表）
 *     4. 代码检测到 Alice 没有 scoped 数据 → 读取 ALL unscoped 数据
 *        → 执行 UPDATE 重命名为 u:aliceId:* → Alice 永久获得管理员全部遗留数据
 *     5. 管理员随后登录 → 名下 scoped 数据为空 → 所有作品/素材永久丢失
 *
 *   影响：跨用户数据泄漏 + 原所有者永久数据丢失（高严重性）
 *
 * 修复策略：
 *   仅 admin 角色可触发 unscoped fallback 迁移；非 admin 用户即使名下无 scoped 数据
 *   也不得读取或迁移任何 unscoped 遗留数据。
 *   （unscoped 数据产生于单用户时代，逻辑上属于最初的管理员。）
 *
 * 用法：
 *   npx tsx tests/unscoped-migration-theft.ts
 */

// @ts-nocheck
import { unlinkSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import Database from "better-sqlite3";

const DATA_DIR = resolve(__dirname, "..", "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = resolve(DATA_DIR, "test-unscoped-migration-theft.db");
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
  CREATE TABLE materials (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE examples (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// --- 与修复后 route.ts 保持一致的语义 ---------------------------------------------

function scopeKey(userId: string, key: string): string {
  return `u:${userId}:${key}`;
}

type Role = "admin" | "experience";

/**
 * 复刻修复后 GET /api/writing-documents?key=xxx 的单键读取语义：
 * 1. 先读 scoped key；2. 仅 admin 可回退到 unscoped 并迁移。
 */
function writingDocGetSingle(
  userId: string,
  role: Role,
  key: string
): { data: unknown; migrated: boolean } {
  const scoped = scopeKey(userId, key);
  let row = db
    .prepare("SELECT data FROM writing_documents WHERE key = ?")
    .get(scoped) as { data: string } | undefined;

  let migrated = false;
  if (!row && role === "admin") {
    if (key.startsWith("u:")) {
      return { data: null, migrated: false };
    }
    row = db
      .prepare("SELECT data FROM writing_documents WHERE key = ?")
      .get(key) as { data: string } | undefined;
    if (row) {
      const exists = db
        .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
        .get(scoped);
      if (!exists) {
        db.prepare("UPDATE writing_documents SET key = ? WHERE key = ?").run(
          scoped,
          key
        );
        migrated = true;
      }
    }
  }
  if (!row) return { data: null, migrated: false };
  try {
    return { data: JSON.parse(row.data), migrated };
  } catch {
    throw new Error("数据损坏");
  }
}

/**
 * 复刻修复后 GET /api/writing-documents（无 key）的批量列表语义：
 * 1. 先读全部 scoped key；2. 仅 admin + 无 scoped 数据时可回退迁移
 */
function writingDocListAll(
  userId: string,
  role: Role
): { records: Record<string, unknown>; migratedCount: number } {
  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT key, data FROM writing_documents WHERE key LIKE ?")
    .all(`${prefix}%`) as { key: string; data: string }[];

  let migratedCount = 0;
  if (rows.length === 0 && role === "admin") {
    const unscoped = db
      .prepare("SELECT key, data FROM writing_documents WHERE key NOT LIKE 'u:%'")
      .all() as { key: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newKey = prefix + oldRow.key;
        const exists = db
          .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
          .get(newKey);
        if (!exists) {
          db.prepare("UPDATE writing_documents SET key = ? WHERE key = ?").run(
            newKey,
            oldRow.key
          );
          migratedCount++;
        }
      }
      rows = unscoped.map((r) => ({ key: prefix + r.key, data: r.data }));
    }
  }

  const records: Record<string, unknown> = {};
  for (const r of rows) {
    const bareKey = r.key.slice(prefix.length);
    try {
      records[bareKey] = JSON.parse(r.data);
    } catch {
      // skip corrupt
    }
  }
  return { records, migratedCount };
}

/**
 * 复刻修复后 GET /api/materials 的批量列表语义。
 */
function materialsListAll(
  userId: string,
  role: Role
): { count: number; migratedCount: number; seenIds: Set<string> } {
  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT id, data FROM materials WHERE id LIKE ? ORDER BY updated_at DESC")
    .all(`${prefix}%`) as { id: string; data: string }[];

  let migratedCount = 0;
  if (rows.length === 0 && role === "admin") {
    const unscoped = db
      .prepare("SELECT id, data FROM materials WHERE id NOT LIKE 'u:%' ORDER BY updated_at DESC")
      .all() as { id: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newId = prefix + oldRow.id;
        const exists = db.prepare("SELECT 1 FROM materials WHERE id = ?").get(newId);
        if (!exists) {
          db.prepare("UPDATE materials SET id = ? WHERE id = ?").run(newId, oldRow.id);
          migratedCount++;
        }
      }
      rows = unscoped.map((r) => ({ id: prefix + r.id, data: r.data }));
    }
  }

  const seenIds = new Set<string>();
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.data) as Record<string, unknown>;
      const bareId = r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id;
      seenIds.add(String(parsed.id ?? bareId));
    } catch {
      // skip
    }
  }
  return { count: seenIds.size, migratedCount, seenIds };
}

/**
 * 复刻修复后 GET /api/examples?id=xxx 的单键读取语义。
 */
function exampleGetSingle(
  userId: string,
  role: Role,
  id: string
): { data: Record<string, unknown> | null; migrated: boolean } {
  function scope(id: string) {
    return `u:${userId}:${id}`;
  }
  let row = db
    .prepare("SELECT data FROM examples WHERE id = ?")
    .get(scope(id)) as { data: string } | undefined;

  let migrated = false;
  if (!row && role === "admin") {
    row = db
      .prepare("SELECT data FROM examples WHERE id = ?")
      .get(id) as { data: string } | undefined;
    if (row) {
      const scopedId = scope(id);
      const exists = db.prepare("SELECT 1 FROM examples WHERE id = ?").get(scopedId);
      if (!exists) {
        db.prepare("UPDATE examples SET id = ? WHERE id = ?").run(scopedId, id);
        migrated = true;
      }
    }
  }
  if (!row) return { data: null, migrated: false };
  try {
    return { data: JSON.parse(row.data) as Record<string, unknown>, migrated };
  } catch {
    throw new Error("数据损坏");
  }
}

/**
 * 复刻修复后 GET /api/examples（无 id）的批量列表语义。
 */
function exampleListAll(
  userId: string,
  role: Role
): { count: number; migratedCount: number; seenIds: Set<string> } {
  const prefix = `u:${userId}:`;
  let rows = db
    .prepare("SELECT id, data FROM examples WHERE id LIKE ? ORDER BY updated_at DESC")
    .all(`${prefix}%`) as { id: string; data: string }[];

  let migratedCount = 0;
  if (rows.length === 0 && role === "admin") {
    const unscoped = db
      .prepare("SELECT id, data FROM examples WHERE id NOT LIKE 'u:%' ORDER BY updated_at DESC")
      .all() as { id: string; data: string }[];
    if (unscoped.length > 0) {
      for (const oldRow of unscoped) {
        const newId = prefix + oldRow.id;
        const exists = db.prepare("SELECT 1 FROM examples WHERE id = ?").get(newId);
        if (!exists) {
          db.prepare("UPDATE examples SET id = ? WHERE id = ?").run(newId, oldRow.id);
          migratedCount++;
        }
      }
      rows = unscoped.map((r) => ({ id: prefix + r.id, data: r.data }));
    }
  }

  const seenIds = new Set<string>();
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.data) as Record<string, unknown>;
      const bareId = r.id.startsWith(prefix) ? r.id.slice(prefix.length) : r.id;
      seenIds.add(String(parsed.id ?? bareId));
    } catch {
      // skip
    }
  }
  return { count: seenIds.size, migratedCount, seenIds };
}

// --- 测试工具 ------------------------------------------------------------------

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

function now(): string {
  return new Date().toISOString();
}

// --- 测试场景 ------------------------------------------------------------------

function resetDb(): void {
  db.exec("DELETE FROM writing_documents");
  db.exec("DELETE FROM materials");
  db.exec("DELETE FROM examples");
}

function seedLegacyWritingDocs(): void {
  // 模拟 pre-multiusers 时代：admin 的作品、草稿、benchmark
  const docs = [
    { key: "works", data: JSON.stringify([{ id: "w1", title: "管理员作品集 A" }, { id: "w2", title: "管理员作品集 B" }]) },
    { key: "draft", data: JSON.stringify({ secret: "管理员未完成的长篇大纲 - 机密" }) },
    { key: "benchmark", data: JSON.stringify({ baseline: "admin-v1.2", score: 92 }) },
  ];
  const stmt = db.prepare(
    "INSERT INTO writing_documents (key, data, updated_at) VALUES (?, ?, ?)"
  );
  for (const d of docs) {
    stmt.run(d.key, d.data, now());
  }
}

function seedLegacyMaterials(): void {
  const mats = [
    { id: "atom-heroine", data: JSON.stringify({ id: "atom-heroine", layer: "atom", source: "preset", favorited: true, atom: { summary: "倔强女主" } }) },
    { id: "atom-twist", data: JSON.stringify({ id: "atom-twist", layer: "atom", source: "extracted", atom: { summary: "身份反转" } }) },
    { id: "comp-setup", data: JSON.stringify({ id: "comp-setup", layer: "component", component: { kind: "setup", tags: ["开篇"] } }) },
  ];
  const stmt = db.prepare(
    "INSERT INTO materials (id, data, updated_at) VALUES (?, ?, ?)"
  );
  for (const m of mats) {
    stmt.run(m.id, m.data, now());
  }
}

function seedLegacyExamples(): void {
  const exs = [
    {
      id: "ex-suspense-classic",
      data: JSON.stringify({
        id: "ex-suspense-classic",
        title: "经典悬念开局",
        text: "夜色沉沉，电话铃响了三遍……",
        paragraphs: [],
        introSentences: ["夜色沉沉，电话铃响了三遍。"],
        tags: ["悬念", "开篇"],
        status: "analyzed",
        reportId: "rpt-001",
        analysis: { score: 95 },
      }),
    },
    {
      id: "ex-romance-bestseller",
      data: JSON.stringify({
        id: "ex-romance-bestseller",
        title: "爆款都市言情",
        text: "他站在落地窗前，背对着她说：我们离婚吧。",
        paragraphs: [],
        introSentences: ["他站在落地窗前，背对着她说：我们离婚吧。"],
        tags: ["言情", "都市"],
        status: "uploaded",
      }),
    },
    {
      id: "ex-chapter1-complete",
      data: JSON.stringify({
        id: "ex-chapter1-complete",
        title: "长篇首章完稿",
        text: "第一章 风起青萍……（全文 3000 字）",
        paragraphs: [],
        introSentences: ["第一章 风起青萍。"],
        tags: ["长篇", "首章"],
        status: "analyzed",
        reportId: "rpt-002",
        guideAnalysis: { stage: "setup" },
      }),
    },
  ];
  const stmt = db.prepare(
    "INSERT INTO examples (id, data, updated_at) VALUES (?, ?, ?)"
  );
  for (const e of exs) {
    stmt.run(e.id, e.data, now());
  }
}

const ADMIN_ID = "admin-001";
const ALICE_ID = "alice-exp-002";

function main(): void {
  console.log("\n===== unscoped-migration-theft 关键回归测试 =====");
  console.log("覆盖场景：非 admin 用户不得触发遗留 unscoped 数据的自动迁移");

  // =========================================================================
  // 场景 1：writing-documents 单键读取 — 非 admin 不能读/迁移 unscoped legacy
  // =========================================================================
  console.log("\n--- 场景 1：writing-documents 单键 unscoped 盗窃防护 ---");
  resetDb();
  seedLegacyWritingDocs();

  // Alice (experience) 抢先登录，尝试读取 key=draft（admin 的机密草稿）
  const aliceDraft = writingDocGetSingle(ALICE_ID, "experience", "draft");
  assert(aliceDraft.data === null, "非 admin 读 legacy draft 得到 null（绝不盗窃）");
  assert(aliceDraft.migrated === false, "非 admin 绝不触发单键迁移");

  // 验证 unscoped draft 还在库中（未被重命名走）
  const unscopedDraftAfter = db
    .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
    .get("draft");
  assert(!!unscopedDraftAfter, "legacy draft 主键仍在原位，未被非 admin 偷走");

  // 验证 Alice 的命名空间下没有 draft
  const aliceScopedDraft = db
    .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
    .get(scopeKey(ALICE_ID, "draft"));
  assert(!aliceScopedDraft, "Alice 的命名空间下没有被误写入 draft");

  // 现在 admin 正常登录并读 draft：应当成功迁移
  const adminDraft = writingDocGetSingle(ADMIN_ID, "admin", "draft");
  assert(adminDraft.data !== null, "admin 能读到 legacy draft（向后兼容）");
  assert(
    (adminDraft.data as Record<string, string>)?.secret === "管理员未完成的长篇大纲 - 机密",
    "admin 读取 legacy draft 内容正确"
  );
  assert(adminDraft.migrated === true, "admin 触发了单键迁移（重命名到 u:admin:）");

  // 迁移后 unscoped draft 应消失（已重命名）
  const unscopedPostAdmin = db
    .prepare("SELECT 1 FROM writing_documents WHERE key = ?")
    .get("draft");
  assert(!unscopedPostAdmin, "admin 迁移后 unscoped draft 主键被重命名");

  // =========================================================================
  // 场景 2：writing-documents 批量列表 — 非 admin 不能 bulk 盗窃全部 legacy
  // =========================================================================
  console.log("\n--- 场景 2：writing-documents 批量 unscoped 盗窃防护 ---");
  resetDb();
  seedLegacyWritingDocs();

  // Alice 先打开工作台 → 批量列表
  const aliceList = writingDocListAll(ALICE_ID, "experience");
  assert(
    Object.keys(aliceList.records).length === 0,
    "非 admin 无 scoped 数据时返回空对象，不得 bulk 读取 unscoped"
  );
  assert(aliceList.migratedCount === 0, "非 admin 绝不触发批量迁移");

  // 3 条 unscoped 文档应完好无损
  const unscopedCount = (db
    .prepare("SELECT COUNT(*) AS c FROM writing_documents WHERE key NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(unscopedCount === 3, `全部 3 条 unscoped writing_doc 仍在库中（实际 ${unscopedCount}）`);

  // Alice 的 scoped 区域仍为空
  const aliceScopedCount = (db
    .prepare("SELECT COUNT(*) AS c FROM writing_documents WHERE key LIKE ?")
    .get(scopeKey(ALICE_ID, "") + "%") as { c: number }).c;
  assert(aliceScopedCount === 0, "Alice 命名空间仍为空，无盗窃");

  // Admin 随后打开工作台 → 正常迁移 3 条
  const adminList = writingDocListAll(ADMIN_ID, "admin");
  assert(adminList.migratedCount === 3, `admin 批量迁移了全部 3 条 legacy 文档（实际 ${adminList.migratedCount}）`);
  assert(
    "works" in adminList.records && "draft" in adminList.records && "benchmark" in adminList.records,
    "admin 列表返回 works / draft / benchmark 三条 key"
  );

  // 迁移完成后 unscoped 应为 0
  const unscopedAfterAdmin = (db
    .prepare("SELECT COUNT(*) AS c FROM writing_documents WHERE key NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(unscopedAfterAdmin === 0, `admin 迁移后库中不再有无主 unscoped writing_doc（剩余 ${unscopedAfterAdmin}）`);

  // =========================================================================
  // 场景 3：materials 批量列表 — 非 admin 不能 bulk 盗窃全部 legacy 素材
  // =========================================================================
  console.log("\n--- 场景 3：materials 批量 unscoped 盗窃防护 ---");
  resetDb();
  seedLegacyMaterials();

  // Alice (experience) 先打开素材库 → 批量列表
  const aliceMats = materialsListAll(ALICE_ID, "experience");
  assert(aliceMats.count === 0, "非 admin 无 scoped 素材时返回空列表，不得 bulk 读取 unscoped");
  assert(aliceMats.migratedCount === 0, "非 admin 绝不触发 materials 批量迁移");

  // 3 条 unscoped 素材应完好无损
  const matUnscoped = (db
    .prepare("SELECT COUNT(*) AS c FROM materials WHERE id NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(matUnscoped === 3, `全部 3 条 unscoped materials 仍在库中（实际 ${matUnscoped}）`);

  // Admin 随后打开素材库 → 正常迁移 3 条
  const adminMats = materialsListAll(ADMIN_ID, "admin");
  assert(adminMats.migratedCount === 3, `admin 批量迁移了全部 3 条 legacy 素材（实际 ${adminMats.migratedCount}）`);
  assert(
    adminMats.seenIds.has("atom-heroine") &&
      adminMats.seenIds.has("atom-twist") &&
      adminMats.seenIds.has("comp-setup"),
    "admin 列表包含 atom-heroine / atom-twist / comp-setup 三条素材"
  );

  // 迁移完成后 unscoped 应为 0
  const matUnscopedAfter = (db
    .prepare("SELECT COUNT(*) AS c FROM materials WHERE id NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(matUnscopedAfter === 0, `admin 迁移后库中不再有无主 unscoped materials（剩余 ${matUnscopedAfter}）`);

  // =========================================================================
  // 场景 4：并发时序攻击 — Alice 在 admin 读一次之后也看不到 admin 的已命名空间数据
  // =========================================================================
  console.log("\n--- 场景 4：admin 已迁移后 Alice 无法看到 admin 的 scoped 数据 ---");
  resetDb();
  seedLegacyWritingDocs();

  // Admin 先迁移（正常路径）
  writingDocListAll(ADMIN_ID, "admin");

  // Alice 随后访问（此时 Alice 名下仍无 scoped 数据）
  const aliceAfter = writingDocListAll(ALICE_ID, "experience");
  assert(
    Object.keys(aliceAfter.records).length === 0,
    "admin 已迁移后 Alice 列表仍为空（只看自己的命名空间）"
  );

  // Alice 尝试用单键直接读 admin 的 scoped 键名
  const alicePeek = writingDocGetSingle(ALICE_ID, "experience", "draft");
  assert(alicePeek.data === null, "Alice 单键读 draft 仍为 null（scoped 键名不同）");

  // =========================================================================
  // 场景 5：examples 单键读取 — 非 admin 不能读/迁移 unscoped legacy 例文
  // =========================================================================
  console.log("\n--- 场景 5：examples 单键 unscoped 盗窃防护 ---");
  resetDb();
  seedLegacyExamples();

  // Alice (experience) 抢先打开例文详情 → 读爆款全文
  const aliceEx = exampleGetSingle(ALICE_ID, "experience", "ex-romance-bestseller");
  assert(aliceEx.data === null, "非 admin 读 legacy 例文得 null（绝不盗窃）");
  assert(aliceEx.migrated === false, "非 admin 绝不触发 examples 单键迁移");

  // 验证 unscoped 例文还在库中
  const unscopedExAfter = db
    .prepare("SELECT 1 FROM examples WHERE id = ?")
    .get("ex-romance-bestseller");
  assert(!!unscopedExAfter, "legacy ex-romance-bestseller 主键仍在原位，未被非 admin 偷走");

  // Admin 正常登录读例文 → 应当成功迁移
  const adminEx = exampleGetSingle(ADMIN_ID, "admin", "ex-romance-bestseller");
  assert(adminEx.data !== null, "admin 能读到 legacy 例文（向后兼容）");
  assert(
    (adminEx.data as Record<string, string>).title === "爆款都市言情",
    "admin 读取例文内容正确"
  );
  assert(adminEx.migrated === true, "admin 触发了 examples 单键迁移");

  // 迁移后 unscoped 例文应消失
  const unscopedExPost = db
    .prepare("SELECT 1 FROM examples WHERE id = ?")
    .get("ex-romance-bestseller");
  assert(!unscopedExPost, "admin 迁移后 unscoped 例文主键被重命名");

  // =========================================================================
  // 场景 6：examples 批量列表 — 非 admin 不能 bulk 盗窃全部 legacy 例文
  // =========================================================================
  console.log("\n--- 场景 6：examples 批量 unscoped 盗窃防护 ---");
  resetDb();
  seedLegacyExamples();

  // Alice 先打开例文库 → 批量列表
  const aliceExList = exampleListAll(ALICE_ID, "experience");
  assert(aliceExList.count === 0, "非 admin 无 scoped 例文时返回空列表，不得 bulk 读取 unscoped");
  assert(aliceExList.migratedCount === 0, "非 admin 绝不触发 examples 批量迁移");

  // 3 条 unscoped 例文应完好无损
  const exUnscoped = (db
    .prepare("SELECT COUNT(*) AS c FROM examples WHERE id NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(exUnscoped === 3, `全部 3 条 unscoped examples 仍在库中（实际 ${exUnscoped}）`);

  // Admin 随后打开例文库 → 正常迁移 3 条
  const adminExList = exampleListAll(ADMIN_ID, "admin");
  assert(adminExList.migratedCount === 3, `admin 批量迁移了全部 3 条 legacy 例文（实际 ${adminExList.migratedCount}）`);
  assert(
    adminExList.seenIds.has("ex-suspense-classic") &&
      adminExList.seenIds.has("ex-romance-bestseller") &&
      adminExList.seenIds.has("ex-chapter1-complete"),
    "admin 例文列表包含 3 条 legacy 例文 ID"
  );

  // 迁移完成后 unscoped 应为 0
  const exUnscopedAfter = (db
    .prepare("SELECT COUNT(*) AS c FROM examples WHERE id NOT LIKE 'u:%'")
    .get() as { c: number }).c;
  assert(exUnscopedAfter === 0, `admin 迁移后库中不再有无主 unscoped examples（剩余 ${exUnscopedAfter}）`);
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
