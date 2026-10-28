/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { uploadProxyPlugin } from './vite/uploadProxyPlugin.ts';

// 개발 서버는 /api/v1/admin 외에는 CORS를 열지 않는다(open-questions Q-01).
// 브라우저는 같은 출처의 /api 로 부르고, dev·preview 서버가 PROXY_TARGET 으로 넘긴다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // PROXY_TARGET은 공개 개발 서버 주소이며 비밀이 아니다(.env.example 참고).
  const proxyTarget = env.PROXY_TARGET ?? 'https://chalkak-dev.pysun.kr';
  const uploadExtraHosts = (env.UPLOAD_PROXY_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const uploadLoopbackPorts = (env.UPLOAD_PROXY_ALLOWED_LOOPBACK_PORTS || '4010').split(',').map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p > 0);
  const proxy = {
    '/api': { target: proxyTarget, changeOrigin: true, secure: true },
  };
  // 개발용 세션 주입(Q-02) 존재 조건. 정적으로 치환되어 꺼진 빌드에서는 관련 코드(동적 import 포함)가 번들에서 빠진다.
  const devSessionEnabled = mode !== 'production' || env.VITE_ENABLE_DEV_SESSION === 'true';
  return {
    define: {
      __DEV_SESSION_ENABLED__: JSON.stringify(devSessionEnabled),
      // presigned PUT 개발 프록시 경유 여부. 꺼진 빌드(기본 배포 빌드)에서는 DevProxyUploadUrlRewriter와 /__upload-proxy 접두가 번들에서 빠진다.
      __UPLOAD_PROXY_ENABLED__: JSON.stringify(mode !== 'production' || env.VITE_UPLOAD_PROXY === 'true'),
    },
    // presigned PUT은 S3로 직접 가면 버킷 CORS에 막힐 수 있다. 개발·preview 서버만 /__upload-proxy/<호스트>/... 를 그 호스트로 중계한다(배포 빌드 산출물에는 영향 없음).
    plugins: [react(), uploadProxyPlugin({ extraHosts: uploadExtraHosts, loopbackPorts: uploadLoopbackPorts, previewEnabled: env.VITE_UPLOAD_PROXY === 'true' })],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // shared/(constants.json, copy/ko.json)를 레포 루트에서 읽는다.
    server: { port: 5173, proxy, fs: { allow: ['..'] } },
    preview: { port: 4173, proxy },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'vite/**/*.test.ts'],
      restoreMocks: true,
    },
  };
});
