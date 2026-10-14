import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('..', import.meta.url));
  const env = loadEnv(mode, envDir, 'PORT');
  const port = process.env.PORT ?? env.PORT ?? '3001';

  return {
    plugins: [react(), tailwindcss()],
    envDir,
    server: {
      // 手機掃 QR 需要從區網連進來，所以監聽所有網卡（只在展示用的 dev server）
      host: true,
      port: 5173,
      strictPort: true,
      // xfwd：把手機等裝置的真實 IP 傳給後端，後台據此判斷是否唯讀
      proxy: { '/api': { target: `http://127.0.0.1:${port}`, xfwd: true } },
    },
  };
});
