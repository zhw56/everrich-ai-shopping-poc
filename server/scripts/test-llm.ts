/** 模型供應商轉接層測試：Anthropic 形狀 ↔ OpenAI 相容格式（Inception），以及供應商優先序。不呼叫 API。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeProvider, modelFor } from '../src/llm/index.js';
import { fromOpenAI, toOpenAI } from '../src/llm/inception.js';

test('系統提示詞、工具、tool_use／tool_result 轉成 OpenAI 格式', () => {
  const body = toOpenAI({
    model: 'mercury-2',
    max_tokens: 600,
    system: '你是客服',
    tools: [{ name: 'query_promos', description: '查優惠', input_schema: { type: 'object', properties: {} } }],
    tool_choice: { type: 'any' },
    messages: [
      { role: 'user', content: '599 方案' },
      { role: 'assistant', content: [{ type: 'text', text: '' }, { type: 'tool_use', id: 't1', name: 'query_promos', input: { max_fee: 599 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }] },
    ],
  });
  assert.equal(body.messages[0].role, 'system');
  assert.deepEqual(body.messages[2].tool_calls[0], { id: 't1', type: 'function', function: { name: 'query_promos', arguments: '{"max_fee":599}' } });
  assert.equal(body.messages[2].content, null);
  assert.deepEqual(body.messages[3], { role: 'tool', tool_call_id: 't1', content: '{"ok":true}' });
  assert.equal(body.tool_choice, 'required');
  assert.equal(body.tools[0].function.parameters.type, 'object');
  assert.ok(body.max_completion_tokens > 600);
  assert.equal(toOpenAI({ model: 'm', messages: [], tools: body.tools.map(() => ({ name: 'x', input_schema: {} })), tool_choice: { type: 'tool', name: 'x' } }).tool_choice.function.name, 'x');
});

test('回傳轉回 Anthropic 形狀：文字、工具呼叫、停止原因', () => {
  const m = fromOpenAI({ choices: [{ message: { content: '好的', tool_calls: [{ id: 'c1', function: { name: 'get_bill', arguments: '{"month":"2026-09"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  assert.equal(m.stop_reason, 'tool_use');
  assert.deepEqual(m.content[1], { type: 'tool_use', id: 'c1', name: 'get_bill', input: { month: '2026-09' } });
  assert.equal(fromOpenAI({ choices: [{ message: { content: '完成' }, finish_reason: 'stop' }] }).stop_reason, 'end_turn');
  assert.deepEqual(fromOpenAI({ choices: [{ message: { content: null, tool_calls: [{ id: 'c2', function: { name: 'x', arguments: '壞掉' } }] } }] }).content[0].input, {});
});

test('環境變數 LLM_PROVIDER 優先於後台設定', () => {
  const prev = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'inception';
  assert.equal(activeProvider(), 'inception');
  assert.match(modelFor('orchestrator') ?? '', /^mercury/);
  process.env.LLM_PROVIDER = 'anthropic';
  assert.equal(activeProvider(), 'anthropic');
  if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev;
});
