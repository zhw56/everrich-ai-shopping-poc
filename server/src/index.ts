import { config } from './config.js';
import { app } from './app.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`後端已啟動：http://localhost:${config.port}`);
});

server.on('error', (error) => {
  console.error('後端啟動失敗：', error.message);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
