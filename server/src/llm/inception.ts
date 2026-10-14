/**
 * Inception（Mercury）轉接層：把程式內使用的 Anthropic Messages 介面（system、messages、tools、tool_choice、
 * tool_use／tool_result 內容區塊）轉成 OpenAI 相容的 /v1/chat/completions，回傳再轉回 Anthropic 形狀，
 * 讓主控、專員、畫像抽取不用改寫就能切換模型。只在開發測試省錢用；正式展示用 Claude。
 */
import type { LlmClient, LlmStream } from './types.js';

const BASE = () => (process.env.INCEPTION_BASE_URL || 'https://api.inceptionlabs.ai/v1').replace(/\/+$/, '');
const EFFORT = () => (['low', 'medium', 'high'].includes(String(process.env.INCEPTION_REASONING_EFFORT)) ? process.env.INCEPTION_REASONING_EFFORT : 'low');
// 推理型模型的思考也算輸出 token，額外保留空間避免回答被截斷
const REASONING_ROOM = 4000;

const textOf = (c: unknown): string =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n') : '';

export function toOpenAI(p: any): any {
  const messages: any[] = [];
  const sys = textOf(p.system);
  if (sys) messages.push({ role: 'system', content: sys });
  for (const m of p.messages ?? []) {
    if (typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: 'assistant', content: text || (calls.length ? null : ''), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks) {
        if (b.type === 'tool_result') messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
      }
      const text = textOf(blocks);
      if (text) messages.push({ role: 'user', content: text });
    }
  }
  const body: any = {
    model: p.model,
    messages,
    max_completion_tokens: (Number(p.max_tokens) || 1024) + REASONING_ROOM,
    reasoning_effort: EFFORT(),
  };
  const tools = (p.tools ?? []).filter((t: any) => t?.input_schema);
  if (tools.length) {
    body.tools = tools.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.input_schema } }));
    const tc = p.tool_choice;
    body.tool_choice = tc?.type === 'any' ? 'required' : tc?.type === 'none' ? 'none' : tc?.type === 'tool' ? { type: 'function', function: { name: tc.name } } : 'auto';
  }
  return body;
}

let seq = 0;
export function fromOpenAI(j: any): any {
  const choice = j?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  const content: any[] = [];
  if (typeof msg.content === 'string' && msg.content.trim()) content.push({ type: 'text', text: msg.content.trim() });
  for (const c of msg.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(c.function?.arguments || '{}');
    } catch {
      input = {};
    }
    content.push({ type: 'tool_use', id: c.id || `call_${Date.now()}_${++seq}`, name: c.function?.name, input });
  }
  const stop_reason = content.some((b) => b.type === 'tool_use') ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return { content, stop_reason, usage: { input_tokens: j?.usage?.prompt_tokens ?? 0, output_tokens: j?.usage?.completion_tokens ?? 0 } };
}

export function inceptionClient(apiKey: string): LlmClient {
  async function once(p: any, signal?: AbortSignal) {
    // Mercury 通常幾秒內回應，但偶爾卡住不回；單次 20 秒逾時後重試，並跟隨外部取消（專員逾時、用戶中斷）
    const timeout = AbortSignal.timeout(Number(process.env.INCEPTION_TIMEOUT_MS) || 20000);
    const t0 = Date.now();
    const res = await fetch(BASE() + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(toOpenAI(p)),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const raw = await res.text();
    if (process.env.LLM_DEBUG) console.error(`[inception] ${res.status} ${Date.now() - t0}ms tools=${(p.tools ?? []).length} msgs=${(p.messages ?? []).length} ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
    if (!res.ok) {
      const e: any = new Error(`Inception ${res.status} ${raw.slice(0, 300)}`);
      e.status = res.status;
      throw e;
    }
    return fromOpenAI(JSON.parse(raw));
  }
  // 429、5xx、逾時與網路錯誤最多重試 3 次（Inception 偶爾回 504 upstream timeout）
  async function create(p: any, o?: { signal?: AbortSignal }) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(p, o?.signal);
      } catch (e: any) {
        const retryable = !o?.signal?.aborted && (e?.status === 429 || e?.status >= 500 || (!e?.status && e?.name !== 'AbortError'));
        if (process.env.LLM_DEBUG) {
          console.error(`[inception] 第 ${attempt + 1} 次失敗：${e?.status ?? e?.name}`);
          try {
            (await import('node:fs')).writeFileSync(process.env.LLM_DEBUG_DUMP || '/tmp/inception-fail.json', JSON.stringify(toOpenAI(p), null, 2));
          } catch {}
        }
        if (!retryable || attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  // Mercury 很快，串流改成一次拿完整結果再送出文字，避免工具呼叫串流格式差異
  function stream(p: any, o?: { signal?: AbortSignal }): LlmStream {
    const handlers: ((t: string) => void)[] = [];
    let done: Promise<any> | null = null;
    const s: LlmStream = {
      on(_event, cb) {
        handlers.push(cb);
        return s;
      },
      finalMessage() {
        done ??= create(p, o).then((m) => {
          const text = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
          if (text) for (const h of handlers) h(text);
          return m;
        });
        return done;
      },
    };
    return s;
  }
  return { messages: { create, stream } };
}
