import { createBrowserRouter } from 'react-router';
import { ConfigError } from '../core/net/errors';
import { createAppContainer } from './container';
import type { AppEnv } from './container';
import { createAppRoutes } from './routes';

export type Bootstrap = { kind: 'ready'; router: ReturnType<typeof createBrowserRouter> } | { kind: 'config_error' };

/** 실행 환경 설정을 검증해 라우터를 만든다. 설정 오류면 요청을 보내지 않고 오류 화면을 보이게 한다(REQ-NET-002). 그 밖의 오류는 그대로 던진다. */
export function bootstrapApp(env: AppEnv): Bootstrap {
  try {
    return { kind: 'ready', router: createBrowserRouter(createAppRoutes(createAppContainer({ env }))) };
  } catch (error) {
    if (error instanceof ConfigError) return { kind: 'config_error' };
    throw error;
  }
}
