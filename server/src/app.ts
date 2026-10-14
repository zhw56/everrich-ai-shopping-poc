import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chatLimiter } from './limit.js';
import { adminRouter } from './routes/admin.js';
import { compareRouter } from './routes/compare.js';
import { chatRouter } from './routes/chat.js';
import { configRouter } from './routes/config.js';
import { healthRouter } from './routes/health.js';
import { verifyRouter } from './routes/verify.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api/health', healthRouter);
app.use('/api/config', configRouter);
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api/verify', verifyRouter);

app.use('/api/compare', compareRouter);
app.use('/api/admin', adminRouter);

// 正式部署：先執行 npm run build，後端同時提供前台（/、/admin、/compare/:id）
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(WEB_DIST + 'index.html')) {
  app.use(express.static(WEB_DIST, { index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(WEB_DIST + 'index.html'));
}
