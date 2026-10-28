import { createBrowserRouter } from 'react-router';
import type { DataRouter } from 'react-router';
import { ConfigError } from '../core/net/errors';
import { DevProxyUploadUrlRewriter } from '../core/net/UploadUrlRewriter';
import { createAppContainer } from './container';
import type { AppEnv } from './container';
import { createAppRoutes } from './routes';

export type Bootstrap = { kind: 'ready'; router: DataRouter } | { kind: 'config_error' };

/** 개발 모드 또는 VITE_UPLOAD_PROXY=true 빌드에서만 presigned PUT을 개발 프록시로 보낸다(정적 치환이라 꺼진 빌드에서는 rewriter가 번들에서 빠진다). 배포 빌드는 S3로 직접 보낸다. */
const uploadUrlRewriter = (): DevProxyUploadUrlRewriter | undefined => (__UPLOAD_PROXY_ENABLED__ ? new DevProxyUploadUrlRewriter() : undefined);

/** 실행 환경 설정을 검증해 라우터를 만든다. 설정 오류면 요청을 보내지 않고 오류 화면을 보이게 한다(REQ-NET-002). 그 밖의 오류는 그대로 던진다. 모듈 스코프에서 한 번만 부른다(main.tsx). */
export function bootstrapApp(env: AppEnv): Bootstrap {
  try {
    return { kind: 'ready', router: createBrowserRouter(createAppRoutes(createAppContainer({ env, uploadUrlRewriter: uploadUrlRewriter() }))) };
  } catch (error) {
    if (error instanceof ConfigError) return { kind: 'config_error' };
    throw error;
  }
}
