/**
 * (vite.config.ts의 define: `mode !== 'production' || VITE_ENABLE_DEV_SESSION === 'true'`, 곧 import.meta.env.DEV || VITE_ENABLE_DEV_SESSION === 'true'와 같은 조건)
 * 개발용 세션 주입 화면·라우트·로그인 우회 버튼의 존재 조건(Q-02). 빌드 시점에 정해지는 정적 상수라서
 * 이 값이 false인 빌드에서는 관련 코드가 번들에서 빠진다. 사용하는 쪽은 반드시 `if (DEV_SESSION_ENABLED)` 안에서만
 * 개발용 모듈을 (동적) import하거나 참조한다.
 */
export const DEV_SESSION_ENABLED: boolean = __DEV_SESSION_ENABLED__;

/** 개발용 세션 주입 경로. 상수와 같은 파일에 둬서 개발 플래그가 꺼진 번들에 문자열이 남지 않게 한다. */
export const DEV_SESSION_PATH = '/dev/session';
