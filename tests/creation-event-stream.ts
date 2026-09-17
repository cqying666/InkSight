import assert from 'node:assert/strict';
import { createCreationEventDecoder } from '../src/components/creation/event-stream';

// Real transports split CRLF boundaries and multibyte Chinese text at arbitrary bytes.
const wire = ': heartbeat\r\n\r\nevent: session\r\ndata: {"title":"对标文"}\r\n\r\nevent: step\ndata: {"label":\ndata: "读取原文"}\n\nevent: done\ndata: {"ok":true}';
const bytes = new TextEncoder().encode(wire);
for (const chunkSize of [1, 2, 3, 7, 29, bytes.length]) {
  const received: unknown[] = [];
  const decoder = createCreationEventDecoder((event, data) => received.push({ event, data }));
  const utf8 = new TextDecoder();
  for (let cursor = 0; cursor < bytes.length; cursor += chunkSize) decoder.push(utf8.decode(bytes.slice(cursor, cursor + chunkSize), { stream: true }));
  decoder.push(utf8.decode()); decoder.finish(); decoder.finish();
  assert.deepEqual(received, [
    { event: 'session', data: { title: '对标文' } },
    { event: 'step', data: { label: '读取原文' } },
    { event: 'done', data: { ok: true } },
  ], `chunk size ${chunkSize} must preserve all event boundaries and UTF-8 text`);
}
let delivered = 0;
const malformed = createCreationEventDecoder(() => delivered++);
assert.throws(() => malformed.push('event: done\ndata: {broken}\n\n'), SyntaxError);
assert.equal(delivered, 0, 'invalid payload must not report successful completion');
const failure = createCreationEventDecoder((event) => { if (event === 'error') throw new Error('服务失败'); });
assert.throws(() => failure.push('event: error\ndata: {"message":"服务失败"}\n\n'), /服务失败/);
console.log('creation event stream: transport boundaries, UTF-8, malformed and error propagation passed');
