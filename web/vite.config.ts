/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 개발 서버는 /api/v1/admin 외에는 CORS를 열지 않는다(open-questions Q-01).
// 브라우저는 같은 출처의 /api 로 부르고, dev·preview 서버가 PROXY_TARGET 으로 넘긴다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.PROXY_TARGET ?? 'https://chalkak-dev.pysun.kr';
  const proxy = {
    '/api': { target: proxyTarget, changeOrigin: true, secure: true },
  };
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
