import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { loadSettings } from './config/settings.js';

/** 公開部署時的簡易流量限制（記憶體計數，重啟歸零）；本機開發不限制 */
const WINDOW_MS = 10 * 60 * 1000;
const perIp = new Map<string, number[]>();
let day = '';
let dayCount = 0;

function ipOf(req: Request): string {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

export function chatLimiter(req: Request, res: Response, next: NextFunction) {
  if (!config.publicMode) return next();
  const { daily_chat_limit: dailyLimit, ip_chat_limit: ipLimit } = loadSettings();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dailyLimit > 0 && dayCount >= dailyLimit) {
    res.status(429).json({ ok: false, error: 'DAILY_LIMIT', errors: ['今日試用次數已滿，請明天再試'] });
    return;
  }
  const now = Date.now();
  const ip = ipOf(req);
  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (ipLimit > 0 && hits.length >= ipLimit) {
    res.status(429).json({ ok: false, error: 'RATE_LIMIT', errors: ['提問太頻繁，請稍後再試'] });
    return;
  }
  hits.push(now);
  perIp.set(ip, hits);
  dayCount++;
  next();
}
