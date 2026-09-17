import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cwd = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'creation-material-'));
process.chdir(tmp);
try {
  const { getDb, closeDb } = await import('../src/lib/db/index.ts');
  const store = await import('../src/lib/creation/store.ts');
  const { beginCreationRun, stopCreationRun } = await import('../src/lib/creation/runs.ts');
  const { runCreationTurn } = await import('../src/lib/creation/agent.ts');
  const { materialDirectionsSchema, validateMaterialDirections } = await import('../src/lib/creation/material.ts');
  const { taskSchema, bindAnalysisTask, explicitMaterialCount } = await import('../src/lib/creation/task.ts');
  const method = { id: 'method', kind: 'method' as const, title: '素材关系提取', source: 'method.md#L3', version: 'v1', text: '分析关系与利益，不只复述事件。' };
  const framework = { id: 'framework', kind: 'framework' as const, title: '职场关键节点', source: 'framework.md#L8', version: 'v1', text: '关键职责被忽视时检查依赖条件。' };
  const fresh = { ...framework, id: 'family-framework', title: '亲情边界', version: 'v2', text: '亲情责任与独立选择。' };
  const material = '我负责客户交接，但主管把署名给了另一位同事。\n\n作者虚构设定：公司明天关闭。';
  function candidate(n: number, citation: typeof framework | undefined) {
    return {
      title: `方向${n}`, premise: ['她以集体交接迫使团队重新分配责任', '她选择放弃署名并要求公开工作边界', '她帮助竞争者接任，使制度矛盾显现'][n] ?? `她以第${n}种选择推动关系变化`,
      characters: '员工与主管及接任者', conflict: '责任依赖与评价制度持续错位', informationGap: '无需秘密，公开交接责任的选择推进', emotionalGoal: '获得独立和尊重', mechanism: '依赖关系转为协商', changes: '加入集体责任选择并重新评估结构', assumptions: ['系统新增：接任者主动要求公开清单'], risks: ['交接依赖尚需成立'], knowledgeIds: citation ? [method.id, citation.id] : [],
      material: { value: '署名和责任分离造成利益失衡', authorSettings: ['公司明天关闭'], retained: '保留署名被转移的矛盾', changed: '改变为公开协商的选择', protagonist: { desire: '责任获得承认', obstacle: '主管掌握评价权', cost: '可能失去留任机会' }, choices: '公开责任可能失去机会，沉默则继续承担责任', frameworks: [{ kind: citation ? 'knowledge' as const : 'system' as const, name: citation?.title ?? '系统建议：公开协商', knowledgeIds: citation ? [citation.id] : [], fit: '持续责任依赖可推动选择', prerequisites: ['确有交接依赖'], limitations: ['尚无实际后果证据'], tradeoff: '可改为离开，但减少共同责任讨论', beats: ['提出公开交接', '选择承担边界'] }], frameworkStatus: citation ? '已检索，适配仍需核验' : '未检索到适配框架，采用系统建议' },
    };
  }
  function create(message = '从这些素材提炼核心梗与框架。不要重生。') {
    const session = store.createCreationSession('a', { message, files: [{ name: '素材', text: material }] });
    store.mutateCreationSession('a', session.id, s => { s.constraints = ['不要重生']; });
    return session;
  }
  const session = create();
  const basePlan = { kind: 'material', grouping: 'group', authorSettings: ['公司明天关闭'], instruction: '提炼核心梗与框架，不要重生', knowledgeQuery: '职场 责任 署名', targets: [{ kind: 'existing', sourceId: session.sources[0].id }] };
  assert.equal((taskSchema.parse(basePlan) as any).count, 3);
  assert.throws(() => taskSchema.parse({ ...basePlan, count: 6 }));
  const observations: any[] = [];
  const searches: { query: string; kind: unknown }[] = [];
  async function run(id: string, options: { count?: number; expectedCount?: number; parentId?: string; noKnowledge?: boolean; guard?: boolean; check?: 'recover' | 'reject'; range?: boolean; wrongParent?: string; repair?: 'success' | 'invalid' | 'count' | 'missing-reference' | 'method-reference' | 'unknown-reference' | 'invalid-reference'; stopDuringMaterial?: boolean; message?: string } = {}) {
    const state = store.readCreationSession('a', id)!;
    const active = beginCreationRun('a', id, options.message ? { message: options.message } : {});
    let plans = 0, materialCalls = 0, checkCalls = 0;
    const count = options.expectedCount ?? (options.parentId ? 1 : options.count ?? 3);
    const citation = options.noKnowledge ? undefined : options.parentId ? fresh : framework;
    try {
      await runCreationTurn('a', id, active.session.run!.id, active.controller.signal, () => {}, {
        searchKnowledge: (query, limit, kind) => {
          assert.equal(limit, 5); searches.push({ query, kind });
          return options.noKnowledge ? [] : kind === 'framework' ? [citation!] : [method];
        },
        callModel: async (_system, input: any, feature) => {
          if (feature === 'creation-task') return { ...basePlan, targets: [{ kind: 'existing', sourceId: state.sources[0].id, ...(options.range ? { startParagraph: 1, endParagraph: 1 } : {}) }], ...(options.range ? {authorSettings: []} : {}), ...(options.count ? { count: options.count } : {}), ...(options.parentId ? { count: 1, knowledgeQuery: '亲情 责任 边界', context: { goal: '改为亲情关系', mode: 'revision', sourceIds: [state.sources[0].id], reportIds: [], directionIds: [options.parentId], noteIds: [] } } : {}) };
          if (feature === 'creation-plan') {
            observations.push(...input.observed);
            const actions = [...(options.guard ? [{ action: 'finish', message: '已在文本里生成核心梗', waiting: false }] : []), ...(options.wrongParent ? [{action:'directions', instruction:'故意指定另一候选', parentId:options.wrongParent}] : []), { action: 'directions', instruction: '提炼核心梗，遵守不要重生', ...(options.parentId ? { parentId: options.parentId } : {}) }, { action: 'finish', message: '结构化候选已提供', waiting: false }];
            return actions[plans++];
          }
          if (feature === 'creation-material') {
            materialCalls++;
            if(options.repair && materialCalls === 2) {
              assert.ok(input.previousResult);
              assert.ok(input.formatIssues.some((i:any) => i.path.includes(options.repair === 'count' || options.repair?.includes('reference') ? 'directions' : 'limitations')));
              if(options.repair?.includes('reference')) assert.match(input.formatIssues[0].message, /框架来源或名称/);
            }
            if(options.stopDuringMaterial) stopCreationRun('a', id);
            assert.equal(input.executionInstruction, '提炼核心梗，遵守不要重生');
            if(options.wrongParent) assert.ok(input.previousFailures.some((x:any)=>x.error.includes('修订父版本')));
            assert.equal(input.count, count); assert.equal(input.sources[0].text, options.range ? material.split('\n\n')[0] : material);
            assert.ok(input.constraints.includes('不要重生'));
            if (options.parentId && count === 1) { assert.equal(input.parent.id, options.parentId); assert.ok(input.knowledge.some((k: any) => k.id === fresh.id)); assert.ok(!input.knowledge.some((k: any) => k.id === framework.id)); }
            if(options.parentId && count > 1) { assert.equal(input.parent, undefined); }
            const response = { directions: Array.from({ length: count }, (_, n) => ({ ...candidate(n, citation), ...(options.range ? { material: { ...candidate(n, citation).material, authorSettings: [] } } : {}) })) };
            if(options.repair === 'count' && materialCalls === 1) response.directions = response.directions.slice(0, 1);
            if((options.repair === 'success' || options.repair === 'invalid') && (materialCalls === 1 || options.repair === 'invalid')) response.directions[0].material.frameworks[0].limitations = [];
            assert.deepEqual(input.frameworkCatalog, citation ? [{id:citation.id,title:citation.title}] : []);
            if(options.repair?.includes('reference') && (materialCalls === 1 || options.repair === 'invalid-reference')) {
              response.directions[0].material.frameworks[0].knowledgeIds = options.repair === 'method-reference' ? [method.id]
                : options.repair === 'unknown-reference' ? ['fabricated-id'] : [];
            }
            return response;
          }
          if (feature === 'creation-material-check') {
            checkCalls++;
            assert.equal(input.context, undefined, 'review must not receive old directions or historical messages');
            assert.equal(input.parent, undefined, 'revision parent is not a review target');
            assert.equal(input.authorRequest, store.readCreationSession('a', id)!.messages.filter(m=>m.role==='user').at(-1)!.content);
            assert.ok(Array.isArray(input.authorRequirements));
            assert.ok(Array.isArray(input.knowledge));
            if(options.check && checkCalls === 1) return {passed:false,issues:['需要复核的否定意见']};
            if(options.check) assert.ok(input.previousCheck);
            return { passed: options.check !== 'reject', issues: options.check === 'reject' ? ['真实的硬约束违反'] : [] };
          }
          throw new Error(`Unexpected model feature: ${feature}`);
        },
      });
    } finally { active.release(); }
    const result = store.readCreationSession('a', id)!;
    assert.equal(result.run!.status, options.stopDuringMaterial ? 'stopped' : (options.check === 'reject' || options.repair === 'invalid' || options.repair === 'invalid-reference') ? 'failed' : 'complete', JSON.stringify(result.run));
    if(result.run!.status === 'complete') assert.equal(plans, 1 + Number(!!options.guard) + Number(!!options.wrongParent), 'successful material delivery ends the turn without asking the planner to generate again');
    if(options.check) assert.equal(checkCalls, 2);
    if(options.repair) assert.equal(materialCalls, 2, 'one schema repair maximum');
    if(options.stopDuringMaterial) assert.equal(materialCalls, 1);
    return result;
  }
  let result = await run(session.id, { guard: true });
  assert.equal(result.reports.length, 0, 'material must not fabricate a teardown');
  assert.equal(result.directions.length, 3);
  assert.ok(observations.some(o => o.tool === 'completion_check'));
  assert.ok(!result.messages.some(m => m.content === '已在文本里生成核心梗'));
  assert.deepEqual(searches.map(s => s.kind), ['method', 'framework']);
  assert.equal(result.selectedDirectionId, undefined);
  assert.deepEqual(result.savedDirectionIds, []);
  assert.deepEqual(result.directions[0].material!.sources, [{ id: session.sources[0].id, name: '素材', version: session.sources[0].version, start: 1, end: 2 }]);
  const chosen = result.directions[0].id;
  assert.throws(() => store.directionAction('a', session.id, 'save', chosen), /先选定/);
  store.directionAction('a', session.id, 'select', chosen);
  store.directionAction('a', session.id, 'save', chosen);
  store.directionAction('a', session.id, 'save', chosen);
  result = await run(session.id, { parentId: chosen, wrongParent: result.directions[1].id, message: '保留第一个核心梗，改成亲情关系。不要重生。' });
  assert.ok(observations.some(o => o.result?.error?.includes('修订父版本')));
  const revised = result.directions.at(-1)!;
  assert.equal(revised.version, 2); assert.equal(revised.parentId, chosen);
  assert.equal(revised.familyId, result.directions[0].familyId);
  assert.equal(result.selectedDirectionId, chosen, 'revision must not silently select');
  assert.deepEqual(result.savedDirectionIds, [chosen]);
  assert.equal(revised.knowledge!.find(k => k.kind === 'framework')!.version, 'v2');
  assert.equal(result.directions[0].knowledge!.find(k => k.kind === 'framework')!.version, 'v1');
  assert.ok(result.run!.searches!.some(s => s.query === '亲情 责任 边界' && s.results.some(k => k.id === fresh.id)));
  const batchSession = create();
  const initialBatch = await run(batchSession.id);
  const batchParent = initialBatch.directions[0].id;
  store.directionAction('a', batchSession.id, 'select', batchParent);
  const regenerated = await run(batchSession.id, { parentId: batchParent, expectedCount: 3,
    message: '给我的三个框架本质上都是一样的，都是白眼狼。我需要你生成的三个候选方向都不要一致。' });
  assert.equal(regenerated.run!.task!.count, 3);
  assert.equal(regenerated.run!.contextSelection!.mode, 'general');
  assert.equal(regenerated.directions.length, 6);
  assert.deepEqual(regenerated.directions.slice(0, 3), initialBatch.directions);
  assert.ok(regenerated.directions.slice(3).every(d => !d.parentId && d.version === 1));
  assert.equal(regenerated.selectedDirectionId, batchParent);
  assert.deepEqual(regenerated.savedDirectionIds, []);
  const ranged = create();
  const rangedResult = await run(ranged.id, { range: true });
  assert.deepEqual(rangedResult.directions[0].material!.sources.map(s => [s.start,s.end]), [[1,1]]);
  assert.throws(() => bindAnalysisTask(rangedResult, taskSchema.parse({ ...basePlan, targets: [{kind:'existing', sourceId:ranged.sources[0].id, startParagraph:1, endParagraph:1}] }) as any), /作者设定/);
  const explicit = create('请给两个核心梗');
  assert.equal((await run(explicit.id, { count: 2 })).directions.length, 2);
  const single = create('请根据素材提炼一个核心梗');
  const singleResult = await run(single.id, { count: 3, expectedCount: 1 });
  assert.equal(singleResult.run!.task!.count, 1, 'explicit author count overrides model count');
  assert.equal(singleResult.directions.length, 1);
  assert.equal(explicitMaterialCount('给我两条故事核'), 2);
  assert.equal(explicitMaterialCount('生成5种方向'), 5);
  assert.equal(explicitMaterialCount('素材里有三个同事，请帮我构思'), undefined);
  assert.throws(() => explicitMaterialCount('生成六个核心梗'), /1—5/);
  const stringConditions: any = candidate(0, framework);
  stringConditions.material.frameworks[0].limitations = '尚缺交接后果；需作者补充';
  stringConditions.material.frameworks[0].prerequisites = '存在真实的责任依赖';
  const normalizedConditions = materialDirectionsSchema.parse({ directions: [stringConditions] }).directions[0].material.frameworks[0];
  assert.deepEqual(normalizedConditions.limitations, ['尚缺交接后果；需作者补充']);
  assert.deepEqual(normalizedConditions.prerequisites, ['存在真实的责任依赖']);
  for (const field of ['limitations', 'prerequisites']) {
    for (const invalidValue of [[], '']) {
      const invalid = structuredClone(stringConditions);
      invalid.material.frameworks[0][field] = invalidValue;
      assert.equal(materialDirectionsSchema.safeParse({ directions: [invalid] }).success, false, `${field} cannot be empty`);
    }
  }
  const fallback = create();
  const fallbackResult = await run(fallback.id, { noKnowledge: true });
  assert.ok(fallbackResult.directions.every(d => d.material!.frameworks[0].kind === 'system' && d.knowledge!.length === 0));
  for(const repair of ['missing-reference', 'method-reference', 'unknown-reference'] as const) {
    const recovered = await run(create().id, { repair });
    assert.equal(recovered.directions.length, 3);
    assert.ok(recovered.directions.every(d => d.material!.frameworks[0].knowledgeIds.includes(framework.id)));
  }
  const rejectedReferences = await run(create().id, { repair: 'invalid-reference' });
  assert.equal(rejectedReferences.directions.length, 0, 'invalid provenance still cannot be saved after repair');
  assert.match(rejectedReferences.run!.steps.find(s=>s.status==='failed')!.detail!, /缺少框架引用/);
  assert.equal((await run(create().id, {check:'recover'})).directions.length, 3);
  assert.equal((await run(create().id, {check:'reject'})).directions.length, 0);
  const countRepair = await run(create().id, { repair: 'count' });
  assert.equal(countRepair.directions.length, 3, 'wrong model count is repaired before persistence');
  const repairedSession = create();
  const repairedResult = await run(repairedSession.id, { repair: 'success' });
  assert.equal(repairedResult.directions.length, 3);
  assert.ok(repairedResult.directions.every(d => d.material!.frameworks[0].limitations.length > 0));
  assert.ok(repairedResult.directions.every(d => d.authorConstraints!.includes('不要重生')));
  const snapshot = structuredClone(repairedResult.directions);
  store.mutateCreationSession('a', repairedSession.id, s => { s.constraints = ['不要重生', '保留开放结局']; });
  const repairFailed = await run(repairedSession.id, { repair: 'invalid', message: '再提炼三个核心梗，保留开放结局' });
  assert.deepEqual(repairFailed.directions, snapshot, 'invalid repair preserves all earlier artifacts and constraint snapshots');
  const stoppedResult = await run(repairedSession.id, { stopDuringMaterial: true, message: '再尝试一次' });
  assert.deepEqual(stoppedResult.directions, snapshot, 'late material result cannot persist after stop');
  // Validation is deterministic. Passing a model check does not bypass provenance contracts.
  const valid = materialDirectionsSchema.parse({ directions: [candidate(0, framework)] }).directions;
  validateMaterialDirections(valid, result, [method, framework], 1);
  assert.throws(() => validateMaterialDirections(valid, result, [method, framework], 2), /数量/);
  assert.throws(() => validateMaterialDirections([valid[0], valid[0]], result, [method, framework], 2), /重复/);
  const fabricated = structuredClone(valid); fabricated[0].material.frameworks[0].name = '知识库没有的框架';
  validateMaterialDirections(fabricated, result, [method, framework], 1);
  assert.equal(fabricated[0].material.frameworks[0].name, framework.title, 'source title is canonicalized');
  fabricated[0].material.frameworks[0].knowledgeIds = ['fabricated-id'];
  assert.throws(() => validateMaterialDirections(fabricated, result, [method, framework], 1), /框架来源或名称/);
  assert.throws(() => validateMaterialDirections(valid, result, [method, { ...framework, kind: 'case' }], 1), /框架来源或名称/);
  const invented = structuredClone(valid); invented[0].material.authorSettings = ['作者设定主角会时间旅行'];
  assert.throws(() => validateMaterialDirections(invented, result, [method, framework], 1), /作者虚构设定/);
  const combinedSettingsSession = structuredClone(result);
  combinedSettingsSession.run!.task!.authorSettings = ['设定一：A。设定二：B。'];
  const splitSettings = structuredClone(valid);
  splitSettings[0].material.authorSettings = ['设定一：A。', '设定二：B。'];
  validateMaterialDirections(splitSettings, combinedSettingsSession, [method, framework], 1);
  splitSettings[0].material.authorSettings = ['设定三：C。'];
  assert.throws(() => validateMaterialDirections(splitSettings, combinedSettingsSession, [method, framework], 1), /作者虚构设定/);
  const missingTopCitation = structuredClone(valid);
  missingTopCitation[0].knowledgeIds = [method.id];
  validateMaterialDirections(missingTopCitation, result, [method, framework], 1);
  assert.deepEqual(new Set(missingTopCitation[0].knowledgeIds), new Set([method.id, framework.id]), 'valid framework citation is retained even when omitted at candidate level');
  const invalidMissingTop = structuredClone(valid);
  invalidMissingTop[0].knowledgeIds = [method.id];
  invalidMissingTop[0].material.frameworks[0].knowledgeIds = ['not-retrieved'];
  assert.throws(() => validateMaterialDirections(invalidMissingTop, result, [method, framework], 1), /框架来源或名称/);
  const fakeSystem = structuredClone(valid); fakeSystem[0].material.frameworks[0].kind = 'system';
  assert.throws(() => validateMaterialDirections(fakeSystem, result, [method, framework], 1), /系统建议/);
  getDb().prepare('INSERT INTO writing_documents (key,data,updated_at) VALUES (?,?,?)').run('u:a:works', '{}', new Date().toISOString());
  assert.throws(() => store.handoffCreationDirection('a', session.id, chosen), /格式异常/);
  assert.equal(store.readCreationSession('a',session.id)!.directions.length, result.directions.length, 'save failure retains candidates');
  const existingWork = {id:'existing-draft',plainText:'已有正文不可覆盖'};
  getDb().prepare('UPDATE writing_documents SET data=? WHERE key=?').run(JSON.stringify([existingWork]), 'u:a:works');
  const handoff = store.handoffCreationDirection('a', session.id, chosen);
  assert.equal(store.handoffCreationDirection('a', session.id, chosen).workId, handoff.workId);
  const works = JSON.parse((getDb().prepare('SELECT data FROM writing_documents WHERE key=?').get('u:a:works') as { data: string }).data);
  assert.equal(works.length, 2); assert.deepEqual(works[1], existingWork); assert.equal(works[0].plainText, '');
  assert.deepEqual(works[0].creationOrigin.direction.material, result.directions[0].material);
  assert.ok(works[0].documents.outline.includes('不要重生'));
  assert.ok(works[0].documents.outline.includes('知识来源快照'));
  assert.equal(store.readCreationSession('b', session.id), null);
  assert.throws(() => store.directionAction('b', session.id, 'select', chosen), /不存在/);
  assert.throws(() => store.handoffCreationDirection('b', session.id, chosen), /不存在/);
  closeDb();
  const restored = store.readCreationSession('a', session.id)!;
  assert.equal(restored.selectedDirectionId, chosen); assert.deepEqual(restored.savedDirectionIds, [chosen]);
  assert.deepEqual(restored.directions.at(-1)!.material, revised.material);
  closeDb();
  console.log('creation-material: PASS (offline contracts only; direct material, count, completion guard, fresh framework revision, provenance rejection, fallback, persistence, handoff idempotency and isolation).');
} finally { process.chdir(cwd); rmSync(tmp, { recursive: true, force: true }); }
