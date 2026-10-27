import type { IdGenerator } from '../../core/ids';
import type { NonceGenerator } from './nonce';
import type { KakaoCredential, SocialLoginClient } from './SocialLoginClient';

/** 리다이렉트 사이에 rawNonce·state를 두는 sessionStorage 키. 값은 JSON { rawNonce, state }. 1회 사용 후 삭제. */
export const KAKAO_LOGIN_STORAGE_KEY = 'chalkak.kakao-login';
export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';

/** 인가 코드를 ID 토큰으로 바꾼다(카카오 토큰 엔드포인트). idToken이 없으면 null. */
export interface KakaoCodeExchanger {
  exchange(code: string, redirectUri: string): Promise<{ idToken: string | null }>;
}

export interface KakaoWebLoginClientDeps {
  config: { clientId: string; redirectUri: string };
  nonce: NonceGenerator;
  /** OAuth state 생성(CSRF). */
  state: IdGenerator;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  redirect: (url: string) => void;
  exchanger: KakaoCodeExchanger;
  /** 기본 sha256Hex. */
  sha256?: (text: string) => Promise<string>;
}

/**
 * 카카오 OIDC 인가 리다이렉트(Q-02: 서버가 웹 키 aud를 거절할 수 있어 개발 서버 E2E는 세션 주입을 쓴다).
 * login(): 새 rawNonce·state를 sessionStorage에 두고 authorize URL(response_type=code, scope=openid, nonce=SHA-256(rawNonce) hex, state)로 이동. 끝나지 않는 Promise.
 * resume(url): 콜백 URL의 error/state/code를 검사해 idToken과 보관해 둔 rawNonce를 돌려준다. 보관값은 결과와 상관없이 1회 사용 후 삭제.
 */
export class KakaoWebLoginClient implements SocialLoginClient {
  constructor(_deps: KakaoWebLoginClientDeps) {}
  login(_signal?: AbortSignal): Promise<KakaoCredential> {
    throw new Error('not implemented');
  }
  resume(_callbackUrl: string): Promise<KakaoCredential> {
    throw new Error('not implemented');
  }
}
