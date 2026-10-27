export interface DevSessionEnv {
  DEV?: boolean;
  VITE_ENABLE_DEV_SESSION?: string;
}

/** 개발용 세션 주입 화면·라우트·로그인 우회 버튼의 존재 조건: DEV가 true이거나 VITE_ENABLE_DEV_SESSION === 'true'. 그 밖은 모두 없다(Q-02). */
export function isDevSessionEnabled(_env: DevSessionEnv): boolean {
  throw new Error('not implemented');
}
