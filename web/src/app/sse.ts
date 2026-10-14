import type { ChatEvent } from './types';

/** Incremental UTF-8 decoding; lines and JSON may cross any network chunk boundary. */
export async function readSSE(body: ReadableStream<Uint8Array>, onEvent: (event: ChatEvent) => void, signal?: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', event = 'message', data: string[] = [], done = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const line = (value: string) => {
    if (!value) {
      if (data.length) {
        let parsed: unknown;
        try { parsed = JSON.parse(data.join('\n')); } catch { throw new Error('收到的回覆格式不完整，請重試。'); }
        onEvent({ event, data: parsed });
        if (event === 'done') done = true;
      }
      event = 'message'; data = []; return;
    }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = content;
    if (field === 'data') data.push(content);
  };
  try {
    while (!done) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        // A CR at the chunk edge might be half of CRLF.
        if (!chunk.done && match[0] === '\r' && match.index === buffer.length - 1) break;
        const value = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        line(value);
        if (done) break;
      }
      if (chunk.done) break;
    }
    if (!done) throw new Error('連線中斷，回覆尚未完成。請重新送出問題。');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function chat(session_id: string, message: string, onEvent: (event: ChatEvent) => void, signal: AbortSignal) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id, message }), signal });
  if (response.status === 429) {
    const j = await response.json().catch(() => null);
    throw new Error(j?.errors?.[0] ?? '提問太頻繁，請稍後再試。');
  }
  if (!response.ok) throw new Error(`目前無法連線（${response.status}），請稍後再試。`);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('客服尚未就緒，請確認後端已啟動。');
  await readSSE(response.body, onEvent, signal);
}
