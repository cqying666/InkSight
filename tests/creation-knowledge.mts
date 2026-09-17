import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildKnowledgeIndex, CREATION_KNOWLEDGE_FILES, extractKnowledgeUnits, knowledgeStatus, searchCreationKnowledge, searchKnowledgeIndex, writeKnowledgeIndex } from '../src/lib/creation/knowledge.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'creation-knowledge-'));
const previous = process.env.INKSIGHT_CREATION_KNOWLEDGE_FILE;
try {
  process.env.INKSIGHT_CREATION_KNOWLEDGE_FILE = path.join(temporary, 'index.json');
  assert.equal(knowledgeStatus().available, false);
  assert.deepEqual(searchCreationKnowledge('信息差'), []);
  assert.deepEqual(extractKnowledgeUnits('README.md', '# 导航\n## 页面\n只是导航'.repeat(20)), []);
  assert.deepEqual(extractKnowledgeUnits('索引.md', '---\ntype: index\n---\n## 导航\n链接'.repeat(20)), []);
  const teachingCases = extractKnowledgeUnits('课程.md', '# 素材课程\n## 实操\n### 工作流\n' + '提取关系利益和故事代价，结合目标选择方法。'.repeat(4) + '\n### 案例 1：虚构案例\n' + '案例表达只用于理解机制，不能当成统一规则。'.repeat(4));
  assert.deepEqual(teachingCases.map(u => u.kind), ['method', 'case']);
  assert.equal(teachingCases[1].parentId, teachingCases[0].id);
  const fixture = path.join(temporary, 'source');
  const file = path.join(fixture, CREATION_KNOWLEDGE_FILES[1]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# 大概念提取\n\n## 结构动作\n\n结构动作不是复述剧情，描述状态变化与下一章期待。必须依据原文检查信息差如何改变人物决策，以及压力与反抗之间的变化，避免同一冲突反复发生。');
  const first = buildKnowledgeIndex(fixture);
  assert.equal(first.units.length, 1);
  writeKnowledgeIndex(first);
  assert.equal(knowledgeStatus().count, 1);
  const historical = searchCreationKnowledge('结构动作')[0];
  assert.ok(historical.source.endsWith('#L3'));
  const originalText = historical.text;
  fs.appendFileSync(file, '\n\n修订：角色应该产生新的选择。');
  const updated = buildKnowledgeIndex(fixture);
  writeKnowledgeIndex(updated);
  const current = searchCreationKnowledge('结构动作')[0];
  assert.equal(current.id, historical.id);
  assert.notEqual(current.version, historical.version);
  assert.equal(historical.text, originalText);
  fs.unlinkSync(file);
  writeKnowledgeIndex(buildKnowledgeIndex(fixture));
  assert.equal(knowledgeStatus().count, 0);
  assert.deepEqual(searchCreationKnowledge('结构动作'), []);
  assert.ok(historical.text.includes('结构动作'));
  fs.writeFileSync(process.env.INKSIGHT_CREATION_KNOWLEDGE_FILE!, '{broken');
  assert.equal(knowledgeStatus().available, false);

  const localArtifact = path.join(process.cwd(), 'data/creation-knowledge.json');
  if (fs.existsSync(localArtifact)) {
    const index = JSON.parse(fs.readFileSync(localArtifact, 'utf8'));
    assert.equal(index.manifest.length, 7);
    assert.equal(index.units.filter((u: { kind: string }) => u.kind === 'framework').length, 71);
    assert.equal(new Set(index.units.map((u: { id: string }) => u.id)).size, index.units.length);
    for (const [query, expected] of [
      ['AA制 共同责任 规则反噬', 'AA制文学'], ['职场裁到大动脉', '职场裁到大动脉'],
      ['大概念 结构动作 状态升级', '大概念提取'], ['追妻 素材 抽梗', '追妻篇'], ['创新 二创', '创新'],
    ]) assert.ok(searchKnowledgeIndex(index, query, 3).some(r => r.title.includes(expected)), query);
    for (const kind of ['method', 'framework', 'case'] as const) {
      const results = searchKnowledgeIndex(index, '素材 亲情 职场 信息差', 10, kind);
      assert.ok(results.length > 0);
      assert.ok(results.every(r => r.kind === kind));
    }
    for (const query of ['AA制 共同责任', '职场 裁员 大动脉', '亲情 偏心 父母', '追妻 婚恋']) {
      const results = searchKnowledgeIndex(index, query, 3, 'framework');
      assert.ok(results.length > 0, query);
      assert.ok(results.every(r => r.source.includes('71个框架') && r.kind === 'framework'));
    }
    assert.deepEqual(searchKnowledgeIndex(index, 'zzzzzzunknown', 5, 'framework'), []);
    assert.deepEqual(searchKnowledgeIndex(index, 'zzzzzzunknown'), []);
    assert.equal(searchKnowledgeIndex(index, '', 5).length, 0);
    assert.ok(searchKnowledgeIndex(index, '信息差', 100).length <= 10);
    for (const unit of index.units.filter((u: { kind: string }) => u.kind === 'case')) {
      if (unit.source.includes('71个框架')) assert.ok(index.units.some((p: { id: string; kind: string }) => p.id === unit.parentId && p.kind === 'framework'));
      else if (unit.parentId) assert.ok(index.units.some((p: { id: string; kind: string }) => p.id === unit.parentId && p.kind === 'method'));
    }
    console.log(`Local curated artifact: ${index.units.length} units, five retrieval scenarios passed.`);
  } else console.log('Local private artifact absent: fixture lifecycle tests passed; real-corpus scenarios skipped.');
  console.log('creation-knowledge: PASS (missing/corrupt artifact, index exclusion, version update, source deletion, historical snapshot, retrieval limits).');
} finally {
  if (previous === undefined) delete process.env.INKSIGHT_CREATION_KNOWLEDGE_FILE;
  else process.env.INKSIGHT_CREATION_KNOWLEDGE_FILE = previous;
  fs.rmSync(temporary, { recursive: true, force: true });
}
