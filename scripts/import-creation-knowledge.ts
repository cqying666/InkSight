import path from 'node:path';
import { buildKnowledgeIndex, writeKnowledgeIndex } from '../src/lib/creation/knowledge';

const root = process.argv[2];
if (!root || !path.isAbsolute(root)) {
  console.error('用法：npx tsx scripts/import-creation-knowledge.ts <知识库绝对路径> [产物绝对路径]');
  process.exitCode = 1;
} else {
  const destination = process.argv[3];
  if (destination && !path.isAbsolute(destination)) throw new Error('产物路径必须是绝对路径');
  const index = buildKnowledgeIndex(root);
  writeKnowledgeIndex(index, destination);
  console.log(JSON.stringify({ sources: index.manifest, count: index.units.length,
    kinds: Object.fromEntries(['method', 'framework', 'case'].map(kind => [kind, index.units.filter(u => u.kind === kind).length])),
    builtAt: index.builtAt, retrieval: index.retrieval }, null, 2));
}
