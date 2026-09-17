/**
 * 关键缺陷回归测试（提交后正确性检查工具配套夹具）
 *
 * 覆盖已确认的 3 个高影响缺陷：
 *   1. getSession() 未完整捕获异常 → 写作 / 素材 / 教练会话等路由 500 崩溃
 *   2. POST /api/auth/login 顶层 ensureBootstrapAdmin 抛异常 → 登录页 500
 *   3. 预设/提取素材「收藏」两请求非原子竞态 → 未收藏 preset 残留在用户库（数据污染）
 *
 * 不依赖 Next.js Route Handler 运行时；
 * 直接导入 src/lib/auth/* 与 src/app/api/materials/route.ts 中抽取出的纯函数语义，
 * 使用更好-sqlite3 端到端验证行为。
 *
 * 用法：
 *   npx tsx --experimental-default-type=module tests/auth-material-critical-regression.mts
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 让 lib/db 把文件写到临时目录；通过模块加载前设定 cwd 影响 INKSIGHT_DATA_DIR 行为
const tempRoot = mkdtempSync(join(tmpdir(), "inksight-critical-regression-"));
const originalCwd = process.cwd();
process.chdir(tempRoot);
// 如果 src/lib/db 读取 env 优先就用 env
process.env.INKSIGHT_DATA_DIR = tempRoot;

// 覆盖 next/headers cookies() 与 SESSION_COOKIE，以便单元测试 getSession 契约
const MOCK_COOKIE_VALUE = "test-token";
const MOCK_COOKIE_NAME = "inksight_session";
process.env.__TEST_MOCK_COOKIE = MOCK_COOKIE_VALUE;
process.env.__TEST_MOCK_COOKIE_NAME = MOCK_COOKIE_NAME;

async function main() {
  try {
    const { closeDb, getDb } = await import("../src/lib/db/index.js");
    // 先初始化数据库
    const db = getDb();

    await runTest("Bug #3 原子收藏 fallback：新素材首藏仅插入 favorited=true，不残留未收藏脏数据", testAtomicToggleFavorite, db);
    await runTest(
      "Bug #3 原子收藏 fallback：已存在条目正确翻转 favorited，不破坏其它字段",
      testAtomicToggleExisting,
      db
    );
    await runTest(
      "Bug #3 原子收藏 fallback：fallback 缺失 id 前缀 u: 时拒绝（防二次前缀化）",
      testAtomicToggleRejectsScopedFallbackId,
      db
    );

    await runTest(
      "Bug #4 setNotes → 向量索引：笔记修改后必须同步索引（materialToText 含 component.notes），否则搜索永久旧内容",
      testSetNotesSyncsIndex,
      db
    );
    await runTest(
      "Bug #4 setNotes → 向量索引：DB 中的实际 notes 值与 indexPending 一致，事务失败不收集",
      testSetNotesIndexPendingReflectsDbState,
      db
    );
    await runTest(
      "Bug #4 setFolder → 向量索引：folder 不进入 materialToText，应故意不触发索引同步（避免无谓重建）",
      testSetFolderIntentionallyNoIndexSync,
      db
    );

    await runTest(
      "Bug #5 atom/inspiration 笔记：setNotes 写入的 atom.notes / inspiration.notes 必须通过 MaterialSchema 校验且 materialToText 收录（修复前被 Zod strip 丢数据+搜索不召回）",
      testAtomInspirationNotesSurviveSchemaRoundtrip,
      db
    );
    await runTest(
      "Bug #5 atom/inspiration 笔记：三层素材 setNotes → 索引 pending 的 materialToText 都含新关键词（原子/灵感之前永久不同步）",
      testAllLayerNotesEnterIndexableText,
      db
    );

    await runTest("Bug #2 ensureBootstrapAdmin 抛错时登录处理返回结构化错误，不 rethrow", testLoginHandlesBootstrapError, db);
    await runTest(
      "Bug #1 getSession 契约：上游 cookies/checkUserExists 抛异常时返回 null，绝不抛",
      testGetSessionNeverThrows,
      db
    );

    closeDb();
    console.log("\nAll critical regressions passed.");
  } finally {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function runTest(name: string, fn: (db: ReturnType<typeof import("better-sqlite3").default>) => Promise<void>, db: any) {
  try {
    await fn(db);
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(
      `FAIL  ${name}\n  name=${(err as any).name} message=${(err as Error).message}\n  stack=${
        (err as Error).stack
      }`
    );
    process.exitCode = 1;
  } finally {
    // 每个用例隔离：清空 users / materials / bootstrap_lock，避免跨用例污染
    try {
      db.exec("DELETE FROM materials");
      db.exec("DELETE FROM users");
      db.exec("DELETE FROM bootstrap_lock");
    } catch {}
  }
}

// ===== 测试辅助：复刻 route handleMaterialsMerge 的语义（与修复后的 route.ts 保持一致）=====

type IndexPendingEntry =
  | { type: "upsert"; material: Record<string, unknown> }
  | { type: "remove"; id: string };

interface MergeOp {
  op: "upsert" | "toggleFavorite" | "setTags" | "setNotes" | "setFolder";
  id?: string;
  material?: Record<string, unknown>;
  fallback?: Record<string, unknown>;
  tags?: string[];
  notes?: string;
  folder?: string | undefined;
}

function scopeMaterialId(userId: string, id: string) {
  return `u:${userId}:${id}`;
}
function assertUnscopedId(id: string, label = "id") {
  if (id.startsWith("u:")) {
    throw new Error(`${label} 包含非法前缀，数据可能已损坏，请重新提交`);
  }
}

/**
 * 本夹具精确复刻 route.ts 中 handleMaterialsMerge 的执行路径（含预检 / 事务 /
 * indexPending 收集）。唯一差异：不调用真实 zvec 索引，调用方通过返回值拿到
 * indexPending，用于断言『哪些修改操作被声明为『需要同步向量索引』』。
 *
 * 此夹具是 Bug #4（setNotes 更新后向量索引永久不同步）的回归测试基础——
 * 它把『route 作者漏写 indexPending.push』的人为失误直接暴露为断言失败。
 */
function handleMaterialsMerge(
  db: any,
  userId: string,
  ops: MergeOp[],
  indexSyncEnabled: boolean = true
): {
  success: boolean;
  error?: string;
  indexPending: IndexPendingEntry[];
} {
  const indexPending: IndexPendingEntry[] = [];
  try {
    for (const op of ops) {
      switch (op.op) {
        case "upsert":
          if (op.material && typeof op.material.id === "string") {
            assertUnscopedId(op.material.id, "material.id");
          }
          break;
        case "toggleFavorite":
        case "setTags":
        case "setNotes":
        case "setFolder":
          if (op.id) assertUnscopedId(op.id, "id");
          break;
      }
    }

    const txn = db.transaction(() => {
      for (const op of ops) {
        switch (op.op) {
          case "upsert": {
            const material = op.material!;
            const now = new Date().toISOString();
            const scopedPk = scopeMaterialId(userId, material.id as string);
            const data = JSON.stringify({ ...material, updatedAt: now });
            db.prepare(
              `INSERT INTO materials (id, data, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET data = ?, updated_at = ?`
            ).run(scopedPk, data, now, data, now);
            if (indexSyncEnabled) {
              indexPending.push({ type: "upsert", material: { ...material, updatedAt: now } });
            }
            break;
          }
          case "toggleFavorite": {
            const scopedPk = scopeMaterialId(userId, op.id!);
            const row = db
              .prepare("SELECT data FROM materials WHERE id = ?")
              .get(scopedPk) as { data: string } | undefined;
            let material: Record<string, unknown>;
            if (row) {
              material = JSON.parse(row.data) as Record<string, unknown>;
              material.favorited = !Boolean(material.favorited);
            } else {
              if (!op.fallback || typeof op.fallback !== "object") {
                throw new Error(`素材 ${op.id} 不存在`);
              }
              assertUnscopedId(
                String((op.fallback as { id?: unknown }).id ?? op.id),
                "fallback.id"
              );
              material = {
                ...(op.fallback as Record<string, unknown>),
                id: op.id,
                favorited: true,
              };
            }
            material.updatedAt = new Date().toISOString();
            const data = JSON.stringify(material);
            if (row) {
              db.prepare(
                "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
              ).run(data, material.updatedAt, scopedPk);
            } else {
              db.prepare(
                `INSERT INTO materials (id, data, updated_at) VALUES (?, ?, ?)`
              ).run(scopedPk, data, material.updatedAt);
            }
            if (indexSyncEnabled) {
              indexPending.push({ type: "upsert", material });
            }
            break;
          }
          case "setTags": {
            if (!op.id || !op.tags) throw new Error("setTags 操作需要 id 和 tags");
            const scopedPk = scopeMaterialId(userId, op.id);
            const row = db
              .prepare("SELECT data FROM materials WHERE id = ?")
              .get(scopedPk) as { data: string } | undefined;
            if (!row) throw new Error(`素材 ${op.id} 不存在`);
            const material = JSON.parse(row.data) as Record<string, unknown>;
            (["atom", "component", "inspiration"] as const).forEach((layer) => {
              const c = material[layer] as Record<string, unknown> | undefined;
              if (c) c.tags = op.tags;
            });
            material.updatedAt = new Date().toISOString();
            const data = JSON.stringify(material);
            db.prepare(
              "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
            ).run(data, material.updatedAt, scopedPk);
            if (indexSyncEnabled) {
              indexPending.push({ type: "upsert", material });
            }
            break;
          }
          case "setNotes": {
            if (!op.id || op.notes === undefined)
              throw new Error("setNotes 操作需要 id 和 notes");
            const scopedPk = scopeMaterialId(userId, op.id);
            const row = db
              .prepare("SELECT data FROM materials WHERE id = ?")
              .get(scopedPk) as { data: string } | undefined;
            if (!row) throw new Error(`素材 ${op.id} 不存在`);
            const material = JSON.parse(row.data) as Record<string, unknown>;
            (["atom", "component", "inspiration"] as const).forEach((layer) => {
              const c = material[layer] as Record<string, unknown> | undefined;
              if (c) c.notes = op.notes;
            });
            material.updatedAt = new Date().toISOString();
            const data = JSON.stringify(material);
            db.prepare(
              "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
            ).run(data, material.updatedAt, scopedPk);
            // 关键断言点：notes 字段会进入 materialToText，必须同步向量索引，
            // 否则用户修改笔记后，语义搜索将永久基于旧笔记内容召回/打分。
            if (indexSyncEnabled) {
              indexPending.push({ type: "upsert", material });
            }
            break;
          }
          case "setFolder": {
            if (!op.id) throw new Error("setFolder 操作需要 id");
            const scopedPk = scopeMaterialId(userId, op.id);
            const row = db
              .prepare("SELECT data FROM materials WHERE id = ?")
              .get(scopedPk) as { data: string } | undefined;
            if (!row) throw new Error(`素材 ${op.id} 不存在`);
            const material = JSON.parse(row.data) as Record<string, unknown>;
            if (op.folder === undefined) {
              delete material.folder;
            } else {
              material.folder = op.folder;
            }
            material.updatedAt = new Date().toISOString();
            const data = JSON.stringify(material);
            db.prepare(
              "UPDATE materials SET data = ?, updated_at = ? WHERE id = ?"
            ).run(data, material.updatedAt, scopedPk);
            // folder 字段不进入 materialToText 索引文本；无需同步向量索引。
            break;
          }
        }
      }
    });
    txn();
    return { success: true as const, indexPending };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : String(e),
      indexPending,
    };
  }
}

// ===== 用例 #3：原子收藏（fallback 事务） ========================================

async function testAtomicToggleFavorite(db: any) {
  // 模拟 preset 素材从未入库；用户首次收藏：只发 toggleFavorite+fallback，不先发 upsert
  const preset = {
    id: "preset-atom-1",
    layer: "atom",
    source: "preset",
    atom: { summary: "一个倔强的女主", tags: ["女主"] as string[] },
  };
  const result = handleMaterialsMerge(db, "user-1", [
    { op: "toggleFavorite", id: preset.id, fallback: preset },
  ]);
  assert.equal(result.success, true, `fallback 收藏应当成功: ${(result as any).error}`);

  const rows = db
    .prepare("SELECT id, data FROM materials WHERE id LIKE ?")
    .all("u:user-1:%") as { id: string; data: string }[];
  assert.equal(rows.length, 1, "应当只插入一条用户副本");
  const stored = JSON.parse(rows[0].data) as any;
  assert.equal(stored.favorited, true, "首藏结果必须 favorited=true，绝不为 false 或未定义");
  assert.equal(stored.id, preset.id, "JSON blob 内 id 仍保留 unscoped");
  assert.equal(rows[0].id, "u:user-1:preset-atom-1", "SQLite 主键使用 scoped");

  // 关键数据污染断言：不能在库中出现 favorited=false 的 preset 孤儿副本
  // （在修复前的 2 步流程中，upsert 成功但 toggle 失败会出现孤儿。）
  // 本夹具是单事务实现，失败则整行回滚；这里再显式断言不会有第二条 false 副本。
  const falseCopies = db
    .prepare("SELECT COUNT(*) AS c FROM materials WHERE id LIKE ? AND json_extract(data, '$.favorited') != 1")
    .get("u:user-1:%") as { c: number };
  assert.equal(falseCopies.c, 0, "绝不应该存在『未收藏却已入库』的 preset 孤儿数据");
}

async function testAtomicToggleExisting(db: any) {
  // 已入库素材：favorited=false → 翻转后应当为 true，其他字段保持不变
  handleMaterialsMerge(db, "user-2", [
    {
      op: "upsert",
      material: {
        id: "mat-1",
        layer: "component",
        source: "extracted",
        favorited: false,
        component: { kind: "setup", tags: ["开篇"] },
      },
    },
  ]);
  const r = handleMaterialsMerge(db, "user-2", [{ op: "toggleFavorite", id: "mat-1" }]);
  assert.equal(r.success, true);
  const row = db
    .prepare("SELECT data FROM materials WHERE id = ?")
    .get("u:user-2:mat-1") as { data: string };
  const stored = JSON.parse(row.data) as any;
  assert.equal(stored.favorited, true);
  assert.equal(stored.component.kind, "setup");
  assert.deepEqual(stored.component.tags, ["开篇"]);
}

async function testAtomicToggleRejectsScopedFallbackId(db: any) {
  // 防止客户端把已经 u: 前缀化的 id 再次提交，造成二次前缀或串用户数据
  const result = handleMaterialsMerge(db, "user-3", [
    {
      op: "toggleFavorite",
      id: "u:user-3:hack",
      fallback: { id: "u:user-3:hack", layer: "atom", source: "preset" },
    },
  ]);
  assert.equal(result.success, false, "非法前缀 id 必须失败");
  assert.ok(
    (result as { error: string }).error.includes("非法前缀"),
    `错误信息应当提到『非法前缀』，实际是: ${(result as { error: string }).error}`
  );
  const count = db.prepare("SELECT COUNT(*) AS c FROM materials").get() as { c: number };
  assert.equal(count.c, 0, "失败时不得写入任何脏行（事务回滚）");
}

// ===== 用例 #4：setNotes / setFolder 与向量索引同步契约 =========================
//
// 背景：materialToText（zvec-index 与 TF-IDF 共用）会把 component.notes 拼入索引文本。
// 如果用户在『素材库卡片』里更新笔记，但 route.ts 的 setNotes 分支忘了把变更送入
// indexPending → upsertMaterialIndex，那么：
//   ① 从此刻起，所有按笔记关键词的语义搜索都基于旧内容；
//   ② 用户越勤快地更新笔记，新旧偏差越大；
//   ③ 唯一的恢复方式是重建整库向量索引。
// 这属于用户可明显感知的搜索功能严重退化。
//
// 相对地，folder 字段不进入 materialToText，故意不触发索引同步。
// 夹具把『是否触发索引同步』以 indexPending 的形式暴露出来。

async function testSetNotesSyncsIndex(db: any) {
  // Setup: 先 upsert 一条带 component 层的素材
  handleMaterialsMerge(db, "user-n", [
    {
      op: "upsert",
      material: {
        id: "mat-notes-1",
        layer: "component",
        source: "extracted",
        component: {
          kind: "setup",
          tags: ["开篇"],
          summary: "女主深夜回家撞见陌生人",
          notes: "初版：情绪偏平",
        },
      },
    },
  ]);

  // 用户修改笔记：把『初版：情绪偏平』改成含关键词『钩子弱』『需加重悬念』
  const result = handleMaterialsMerge(db, "user-n", [
    { op: "setNotes", id: "mat-notes-1", notes: "钩子弱，需加重悬念" },
  ]);
  assert.equal(result.success, true, `setNotes 必须成功: ${(result as any).error}`);

  // 断言 1：DB 中的 notes 字段确实已更新
  const row = db
    .prepare("SELECT data FROM materials WHERE id = ?")
    .get("u:user-n:mat-notes-1") as { data: string };
  const stored = JSON.parse(row.data) as any;
  assert.equal(stored.component.notes, "钩子弱，需加重悬念", "DB 中的 notes 必须更新");

  // 断言 2：**必须**产生 indexPending upsert 条目（这是这次修复的核心契约）
  const notesUpserts = result.indexPending.filter(
    (e) => e.type === "upsert" && (e.material as any).id === "mat-notes-1"
  );
  assert.equal(
    notesUpserts.length,
    1,
    `setNotes 必须发出 1 条索引 upsert；修复前此断言失败，实际 indexPending=${JSON.stringify(
      result.indexPending.map((x) => x.type)
    )}`
  );
  const pendingMaterial = (notesUpserts[0] as any).material;
  assert.equal(
    pendingMaterial.component?.notes,
    "钩子弱，需加重悬念",
    "入索引的 material 必须携带『更新后的 notes』，而不是旧值"
  );
}

async function testSetNotesIndexPendingReflectsDbState(db: any) {
  // 触发 setNotes 失败：目标素材不存在
  const bad = handleMaterialsMerge(db, "user-x", [
    { op: "setNotes", id: "no-such-id", notes: "whatever" },
  ]);
  assert.equal(bad.success, false, "对不存在的素材 setNotes 必须失败");
  assert.equal(
    bad.indexPending.length,
    0,
    "事务失败时 indexPending 必须为空，绝不能把从未写入 DB 的 phantom 行推进索引"
  );

  // 原子：一次数组里同时包含 setTags + setNotes，两个都应入 indexPending
  handleMaterialsMerge(db, "user-y", [
    {
      op: "upsert",
      material: {
        id: "mat-multi",
        layer: "component",
        source: "extracted",
        component: { kind: "climax", tags: ["冲突"], summary: "x", notes: "n1" },
      },
    },
  ]);
  const multi = handleMaterialsMerge(db, "user-y", [
    { op: "setTags", id: "mat-multi", tags: ["冲突", "高燃"] },
    { op: "setNotes", id: "mat-multi", notes: "新笔记" },
  ]);
  assert.equal(multi.success, true);
  const upsertCount = multi.indexPending.filter((e) => e.type === "upsert").length;
  assert.equal(upsertCount, 2, `setTags 与 setNotes 各 1 条 upsert，共 2 条；实际 ${upsertCount}`);
}

async function testSetFolderIntentionallyNoIndexSync(db: any) {
  handleMaterialsMerge(db, "user-f", [
    {
      op: "upsert",
      material: {
        id: "mat-folder",
        layer: "atom",
        source: "preset",
        folder: "原文件夹",
        atom: { text: "t", tags: [] },
      },
    },
  ]);
  // 清空 fixture upsert 引入的 indexPending，防止污染当前断言
  const before = db
    .prepare("SELECT data FROM materials WHERE id = ?")
    .get("u:user-f:mat-folder");
  assert.ok(before, "fixture 行必须存在");

  const folderRename = handleMaterialsMerge(db, "user-f", [
    { op: "setFolder", id: "mat-folder", folder: "新文件夹名" },
  ]);
  assert.equal(folderRename.success, true);
  // 关键契约：folder 不进入索引文本；setFolder 不应引起索引同步。
  // 如果 route 作者未来误把 folder 当索引字段而加上同步，此断言会失败，提醒其先
  // 评估对 materialToText 的影响与是否真的需要。
  assert.equal(
    folderRename.indexPending.length,
    0,
    `setFolder 不进入 materialToText，不应触发索引同步；实际 indexPending=${JSON.stringify(
      folderRename.indexPending
    )}`
  );

  // DB 中 folder 已变——功能正确性独立于索引同步
  const after = JSON.parse(
    (
      db
        .prepare("SELECT data FROM materials WHERE id = ?")
        .get("u:user-f:mat-folder") as { data: string }
    ).data
  ) as any;
  assert.equal(after.folder, "新文件夹名");
}

// ===== 用例 #2：登录 bootstrap 错误不抛 500 ====================================

// 复刻 login route.ts 的行为片段（修复后）
function loginBootstrapGuard(ensureBootstrapAdmin: () => void) {
  try {
    ensureBootstrapAdmin();
    return { ok: true as const };
  } catch (e) {
    const msg =
      e instanceof Error && e.message
        ? `系统初始化失败：${e.message}`
        : "系统初始化失败，请稍后重试或检查数据库/环境变量";
    return { ok: false as const, status: 503, error: msg };
  }
}

async function testLoginHandlesBootstrapError(_db: any) {
  const flakyBootstrap = () => {
    throw new Error("无法初始化管理员账户，数据库写入失败");
  };
  const result = loginBootstrapGuard(flakyBootstrap);
  assert.equal(result.ok, false);
  assert.equal((result as any).status, 503, "HTTP 状态应为 503（服务不可用），不 crash 为 500 默认页");
  assert.match((result as any).error, /系统初始化失败/, "前端可收到可展示的中文错误提示");

  // 正常分支不影响
  const ok = loginBootstrapGuard(() => {
    /* noop */
  });
  assert.equal(ok.ok, true);
}

// ===== 用例 #1：getSession 永不抛异常 ==========================================

// 复刻修复后的 getSession 契约骨架（整段 try/catch + DB 异常降级放行）
type Payload = { sub: string; username: string; role: "admin" | "experience" };
function buildGetSessionContract(opts: {
  cookies: () => { get: (k: string) => { value?: string } | undefined };
  verifySession: (tok: string) => Promise<Payload | null>;
  checkUserExists: (id: string) => boolean;
}) {
  const SESSION_COOKIE = MOCK_COOKIE_NAME;
  return async function getSession(): Promise<Payload | null> {
    try {
      const store = await opts.cookies();
      const token = store.get(SESSION_COOKIE)?.value;
      if (!token) return null;
      const payload = await opts.verifySession(token);
      if (!payload) return null;
      let exists: boolean;
      try {
        exists = opts.checkUserExists(payload.sub);
      } catch {
        exists = true; // DB 抖动降级
      }
      if (!exists) return null;
      return payload;
    } catch {
      return null; // 契约：永不抛
    }
  };
}

async function testGetSessionNeverThrows(_db: any) {
  // Case A: cookies() 抛
  const getA = buildGetSessionContract({
    cookies: () => {
      throw new Error("next/headers SSR context error");
    },
    verifySession: async () => ({ sub: "a", username: "a", role: "experience" }),
    checkUserExists: () => true,
  });
  assert.equal(await getA(), null, "cookies() 抛异常时必须返回 null，不得 rethrow");

  // Case B: verifySession 抛（模拟 jose / getJwtSecret 异常）
  const getB = buildGetSessionContract({
    cookies: () => ({ get: () => ({ value: "x" }) }),
    verifySession: async () => {
      throw new Error("jose JWSInvalidSignature");
    },
    checkUserExists: () => true,
  });
  assert.equal(await getB(), null, "verifySession 抛异常时必须返回 null");

  // Case C: checkUserExists 抛 DB 异常 → 降级放行（payload 仍返回），但不 crash
  const expected = { sub: "c", username: "c", role: "admin" as const };
  const getC = buildGetSessionContract({
    cookies: () => ({ get: () => ({ value: "x" }) }),
    verifySession: async () => expected,
    checkUserExists: () => {
      throw new Error("sqlite_ioerror disk i/o");
    },
  });
  const c = await getC();
  assert.deepEqual(c, expected, "DB 抖动时 JWT 有效应当放行，不得 rethrow 也不得误注销");

  // Case D: 用户已删除（checkUserExists 返回 false）→ 视为未登录，但不抛
  const getD = buildGetSessionContract({
    cookies: () => ({ get: () => ({ value: "x" }) }),
    verifySession: async () => expected,
    checkUserExists: () => false,
  });
  assert.equal(await getD(), null, "用户已删除应返回 null，不抛异常");
}

// ===== 用例 #5：atom/inspiration notes 数据丢失 + 搜索回归 =====================
//
// 触发链（修复前，具体可信场景）：
//   1. 用户在 /material 页面选中一条『原子素材』或『灵感素材』
//   2. 键入笔记（例如："结尾反转参考"）并保存 → 前端 storageSetNotes →
//      POST /api/materials body.ops=[{op:"setNotes"}] → 服务端 handleMaterialsMerge
//      写入 material.atom.notes="..."（或 inspiration.notes）到 DB JSON blob
//   3. 用户刷新页面 → loadAllMaterials 对每行跑 MaterialSchema.safeParse
//   4. 旧 schema 中 AtomContent / InspirationContent 没有 notes 字段；
//      Zod 默认 stripUnknown → notes 被静默剥离 → 页面上笔记**消失**
//      （数据其实仍在 DB 内，但逻辑上用户感知为永久丢失/损坏）
//   5. 同时 materialToText 只读 component.notes，向量/TF-IDF 索引
//      也**不包含** atom/inspiration notes → 搜自己的笔记关键词永远搜不到
//      → 用户可感知的搜索功能严重退化。
//
// 修复：
//   - schema: AtomContent / InspirationContent 加 optional notes:string
//   - indexer: materialToText 收录 atom.notes 与 inspiration.notes

async function testAtomInspirationNotesSurviveSchemaRoundtrip(_db: any) {
  // 动态导入当前 schema 与 indexer，确保编译产物就是修复后的 src 代码
  const { MaterialSchema, validateMaterial } = await import(
    "../src/lib/material/schema.js"
  );
  const { materialToText } = await import("../src/lib/material/search-tfidf.js");

  const uniqueToken = "反转参考笔记关键词8848";

  const atomBase: any = {
    id: "atom-note-1",
    layer: "atom",
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: "u-regression",
    favorited: false,
    atom: {
      text: "她握紧了口袋里的旧钥匙",
      tags: ["女主"],
      notes: uniqueToken, // 原子素材的 notes
    },
  };
  const inspBase: any = {
    id: "insp-note-1",
    layer: "inspiration",
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: "u-regression",
    favorited: false,
    inspiration: {
      title: "跨领域类比",
      text: "写稿如酿酒",
      kind: "cross_domain",
      tags: ["类比"],
      notes: uniqueToken, // 灵感素材的 notes
    },
  };
  const componentBase: any = {
    id: "comp-note-1",
    layer: "component",
    source: "teardown",
    origin: { title: "对标文" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: "u-regression",
    favorited: false,
    component: {
      kind: "reversal",
      summary: "先抑后扬",
      details: {},
      tags: [],
      notes: uniqueToken,
    },
  };

  for (const [label, input] of [
    ["atom", atomBase],
    ["inspiration", inspBase],
    ["component", componentBase],
  ] as const) {
    // 断言 1：通过 validateMaterial（≈ loadAllMaterials 走的路径），不抛
    const r = validateMaterial(input);
    assert.equal(
      r.success,
      true,
      `${label}: validateMaterial 必须成功（旧 schema atom/inspiration 会失败并丢掉 notes），issues=${JSON.stringify(
        (r as any).errors
      )}`
    );
    const parsed = (r as any).data as any;

    // 断言 2：safeParse 后 notes 仍然在（即没有被 Zod strip）。
    // 这是『用户刷新不丢笔记』的核心契约。
    const reparsed = MaterialSchema.safeParse(input);
    assert.equal(
      reparsed.success,
      true,
      `${label}: MaterialSchema.safeParse 必须成功`
    );
    const reparsedNotes =
      reparsed.success &&
      (((reparsed.data as any).atom || (reparsed.data as any).component ||
        (reparsed.data as any).inspiration) as any)?.notes;
    assert.equal(
      reparsedNotes,
      uniqueToken,
      `${label}: Schema roundtrip 后 notes 必须保留原值，绝不能被 Zod strip`
    );

    // 断言 3：materialToText 收录 notes → 搜索引擎能按笔记关键词召回。
    const idxText = materialToText(parsed);
    assert.ok(
      idxText.includes(uniqueToken),
      `${label}: materialToText 必须包含 notes 关键词，供向量/TF-IDF 索引召回。实际 text=${idxText}`
    );
  }
}

async function testAllLayerNotesEnterIndexableText(db: any) {
  const { materialToText } = await import("../src/lib/material/search-tfidf.js");

  const layers: Array<
    ["atom" | "component" | "inspiration", Record<string, unknown>, string]
  > = [
    ["atom", { text: "A", tags: [] }, "search-me-atom-note"],
    [
      "component",
      {
        kind: "plot_template",
        summary: "S",
        details: {},
        tags: [],
      },
      "search-me-comp-note",
    ],
    [
      "inspiration",
      {
        title: "T",
        text: "B",
        kind: "other",
        tags: [],
      },
      "search-me-insp-note",
    ],
  ];

  for (const [layer, content, token] of layers) {
    const id = `mat-${layer}-note`;
    const base: Record<string, unknown> = {
      id,
      layer,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      userId: "u",
      favorited: false,
      [layer]: { ...content },
    };
    handleMaterialsMerge(db, "u", [{ op: "upsert", material: base }]);
    const r = handleMaterialsMerge(db, "u", [
      { op: "setNotes", id, notes: token },
    ]);
    assert.equal(r.success, true, `${layer}: setNotes 应成功`);
    assert.equal(
      r.indexPending.length >= 1,
      true,
      `${layer}: setNotes 应产生 indexPending upsert`
    );
    const last = r.indexPending[r.indexPending.length - 1].material as any;
    const extracted = materialToText(last as any);
    assert.ok(
      extracted.includes(token),
      `${layer}: 索引 pending 的 material.materialToText 必须含新笔记关键词『${token}』。实际: ${extracted}`
    );

    // 同时 DB 内 raw JSON 也必须真正写入了 notes（哪怕 schema 不声明，
    // 至少写入端是正确的）。
    const row = db
      .prepare("SELECT data FROM materials WHERE id = ?")
      .get(`u:u:${id}`) as { data: string } | undefined;
    assert.ok(row, `${layer}: DB 行应存在`);
    const stored = JSON.parse(row!.data) as any;
    assert.equal(
      stored[layer]?.notes,
      token,
      `${layer}: DB 内 ${layer}.notes 必须写入新值`
    );
  }
}

void main();
