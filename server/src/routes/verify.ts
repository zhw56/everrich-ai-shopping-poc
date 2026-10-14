import { Router } from 'express';
import { verifyAndResume } from '../orchestrator/index.js';

export const verifyRouter = Router();

verifyRouter.post('/', async (req, res) => {
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.slice(0, 100) : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const otp = typeof req.body?.otp === 'string' ? req.body.otp : '';
  if (!sessionId || !phone || !otp) {
    res.status(400).json({ ok: false, error: 'session_id、phone、otp 為必填' });
    return;
  }
  res.json(await verifyAndResume(sessionId, phone, otp));
});
