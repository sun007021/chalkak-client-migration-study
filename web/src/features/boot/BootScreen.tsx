import type { ReactNode } from 'react';

/** 스플래시 화면: data-testid="splash.logo"만. 세션을 읽는 동안에도 로그인 화면이 번쩍이지 않는다. */
export function SplashView(): ReactNode {
  throw new Error('not implemented');
}

/** '/' 라우트. BootViewModel을 만들어 start()하고 ready가 되면 판정에 따라 /login 또는 /home으로 replace 이동한다. */
export function BootScreen(): ReactNode {
  throw new Error('not implemented');
}
