import { Router } from 'express';
import { loadFrontend } from '../config/frontend.js';

/** 前台公開設定：文案、快捷入口、建議問題（後台「前台設定」維護） */
export const configRouter = Router();
configRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, data: loadFrontend() });
});
