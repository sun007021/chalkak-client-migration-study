/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_KAKAO_CLIENT_ID?: string;
  /** 'true'면 프로덕션 모드 빌드에서도 개발용 세션 주입을 켠다(Q-02). */
  readonly VITE_ENABLE_DEV_SESSION?: string;
  /** 'true'면 presigned PUT을 /__upload-proxy 경유로 보낸다(개발 서버·preview 프록시 필요). DEV 빌드는 기본으로 켜진다. */
  readonly VITE_UPLOAD_PROXY?: string;
}

/** vite.config.ts의 define이 빌드 시점에 true/false로 치환한다. src/app/devSession.ts 한 곳에서만 읽는다. */
declare const __DEV_SESSION_ENABLED__: boolean;
