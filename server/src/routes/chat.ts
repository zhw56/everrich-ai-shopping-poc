import { Router } from 'express';
import { runTurn } from '../orchestrator/index.js';
import { recordTurn } from '../admin/logs.js';

const NL = String.fromCharCode(10);
export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.slice(0, 100) : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
  if (!sessionId || !message) {
    res.status(400).json({ ok: false, error: 'session_id 與 message 為必填' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  let closed = false;
  res.on('close', () => {
    closed = true;
    controller.abort();
  });
  const emit = (event: string, data: unknown) => {
    if (!closed) res.write(`event: ${event}${NL}data: ${JSON.stringify(data)}${NL}${NL}`);
  };

  try {
    const out = await runTurn(sessionId, message, emit, { signal: controller.signal });
    recordTurn(sessionId, message, out.answer, out.meta as unknown as Record<string, unknown>);
  } catch (e) {
    recordTurn(sessionId, message, '', null);
    if (!closed) {
      console.error('對話處理失敗：', (e as Error).message);
      const code = (e as Error).message;
      // 部署缺設定時直接講清楚，不要讓人以為只是忙碌
      const notConfigured = code === 'NO_API_KEY' || code === 'MODEL_NOT_CONFIGURED';
      const noCredit = /credit balance/i.test(code);
      emit('error', { message: notConfigured ? 'AI 服務尚未設定（缺少 API 金鑰或模型名稱），請管理者到後台系統參數設定。現在可以先用示範模式體驗。' : noCredit ? 'AI 服務額度不足，請管理者儲值後再試。現在可以先用示範模式體驗。' : '系統忙碌中，請稍後再試。' });
      emit('done', { meta: null });
    }
  } finally {
    if (!closed) res.end();
  }
});
