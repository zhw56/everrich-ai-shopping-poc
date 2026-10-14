import test from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from './sse';
import { safeUrl } from './types';
const stream = (bytes: Uint8Array, size = 1) => new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close(); } });
const bytes = (s: string) => new TextEncoder().encode(s);
test('UTF-8, CRLF boundaries, comments and multiline data survive byte-sized chunks', async () => {
 const received: unknown[] = [];
 await readSSE(stream(bytes(': keepalive\r\nevent: delta\r\ndata: {\r\ndata: "text":"昇恆昌 😀"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n')), e => received.push(e));
 assert.deepEqual(received, [{event:'delta',data:{text:'昇恆昌 😀'}},{event:'done',data:{}}]);
});
test('unterminated response is reported, preserving already delivered text', async () => {
 const received: unknown[] = [];
 await assert.rejects(readSSE(stream(bytes('event: delta\ndata: {"text":"部分回答"}\n\n')), e => received.push(e)), /連線中斷/);
 assert.equal(received.length,1);
});
test('invalid event JSON is rejected', async () => {
 await assert.rejects(readSSE(stream(bytes('event: delta\ndata: broken\n\n')), () => {}), /格式不完整/);
});
test('abort releases a stalled reader', async () => {
 const controller = new AbortController(); let cancelled = false;
 const task = readSSE(new ReadableStream({cancel(){cancelled=true;}}), () => {}, controller.signal);
 controller.abort(); await assert.rejects(task, {name:'AbortError'}); assert.equal(cancelled,true);
});
test('done ends reading even when server connection stays open', async () => {
 let cancelled=false;
 await readSSE(new ReadableStream({start(c){c.enqueue(bytes('event: done\ndata: {}\n\n'));},cancel(){cancelled=true;}}),()=>{});
 assert.equal(cancelled,true);
});
test('source and comparison URLs reject executable and external relative schemes', () => {
 assert.equal(safeUrl('javascript:alert(1)'),undefined);
 assert.equal(safeUrl('data:text/html,test'),undefined);
 assert.equal(safeUrl('//evil.example',true),undefined);
 assert.equal(safeUrl('/compare/demo-123',true),'/compare/demo-123');
 assert.equal(safeUrl('https://www.everrich-group.com/'),'https://www.everrich-group.com/');
});
