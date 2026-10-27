import type { IdGenerator } from '../../core/ids';
import { sha256Hex } from './nonce';
import type { NonceGenerator } from './nonce';
import { SocialLoginCancelledError, SocialLoginConfigError, SocialLoginFailedError } from './SocialLoginClient';
import type { KakaoCredential, SocialLoginClient } from './SocialLoginClient';

/** 리다이렉트 사이에 rawNonce·state를 두는 sessionStorage 키. 값은 JSON { rawNonce, state }. 1회 사용 후 삭제. */
export const KAKAO_LOGIN_STORAGE_KEY = 'chalkak.kakao-login';
export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
export const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';

/** 인가 코드를 ID 토큰으로 바꾼다(카카오 토큰 엔드포인트). idToken이 없으면 null. */
export interface KakaoCodeExchanger {
  exchange(code: string, redirectUri: string): Promise<{ idToken: string | null }>;
}

/**
 * 실제 교환기: 카카오 토큰 엔드포인트에 form POST. 키가 없으면 SocialLoginConfigError.
 * 실제 동작(CORS, 서버의 aud 검증)은 Q-02 결론 뒤 E2E에서 확인한다. 이 PR에서는 검증하지 않았다.
 */
export class KakaoTokenEndpointExchanger implements KakaoCodeExchanger {
  constructor(private readonly deps: { clientId: string; fetch: typeof fetch }) {}

  async exchange(code: string, redirectUri: string): Promise<{ idToken: string | null }> {
    if (!this.deps.clientId) throw new SocialLoginConfigError('kakao client id is not configured');
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: this.deps.clientId, redirect_uri: redirectUri, code });
    const response = await this.deps.fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    });
    if (!response.ok) throw new SocialLoginFailedError(`token endpoint responded ${response.status}`);
    const json = (await response.json()) as { id_token?: unknown };
    return { idToken: typeof json.id_token === 'string' && json.id_token !== '' ? json.id_token : null };
  }
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

interface PendingLogin {
  rawNonce: string;
  state: string;
}

function readPending(storage: KakaoWebLoginClientDeps['storage']): PendingLogin | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KAKAO_LOGIN_STORAGE_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) {
      const { rawNonce, state } = parsed as Record<string, unknown>;
      if (typeof rawNonce === 'string' && typeof state === 'string' && rawNonce !== '' && state !== '') return { rawNonce, state };
    }
  } catch {
    // 읽을 수 없으면 시도가 없는 것으로 본다.
  }
  return null;
}

/**
 * 카카오 OIDC 인가 리다이렉트(Q-02: 서버가 웹 키 aud를 거절할 수 있어 개발 서버 E2E는 세션 주입을 쓴다).
 * login(): 새 rawNonce·state를 sessionStorage에 두고 authorize URL(response_type=code, scope=openid, nonce=SHA-256(rawNonce) hex, state)로 이동. 끝나지 않는 Promise.
 * resume(url): 콜백 URL의 error/state/code를 검사해 idToken과 보관해 둔 rawNonce를 돌려준다. 보관값은 결과와 상관없이 1회 사용 후 삭제.
 */
export class KakaoWebLoginClient implements SocialLoginClient {
  constructor(private readonly deps: KakaoWebLoginClientDeps) {}

  async login(_signal?: AbortSignal): Promise<KakaoCredential> {
    const { config, nonce, state, storage, redirect } = this.deps;
    if (!config.clientId) throw new SocialLoginConfigError('kakao client id is not configured');
    const pending: PendingLogin = { rawNonce: nonce.generate(), state: state.next() };
    try {
      storage.setItem(KAKAO_LOGIN_STORAGE_KEY, JSON.stringify(pending));
    } catch {
      throw new SocialLoginFailedError('cannot keep login attempt');
    }
    const hash = await (this.deps.sha256 ?? sha256Hex)(pending.rawNonce);
    const query = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid',
      nonce: hash,
      state: pending.state,
    });
    redirect(`${KAKAO_AUTHORIZE_URL}?${query.toString()}`);
    return new Promise<KakaoCredential>(() => {}); // 페이지를 떠난다
  }

  async resume(callbackUrl: string): Promise<KakaoCredential> {
    const { storage, exchanger, config } = this.deps;
    const pending = readPending(storage);
    try {
      storage.removeItem(KAKAO_LOGIN_STORAGE_KEY); // 결과와 상관없이 1회 사용
    } catch {
      // 지우지 못해도 계속한다.
    }
    let params: URLSearchParams;
    try {
      params = new URL(callbackUrl).searchParams;
    } catch {
      throw new SocialLoginFailedError('invalid callback url');
    }
    const error = params.get('error');
    if (error === 'access_denied') throw new SocialLoginCancelledError('user cancelled');
    if (error) throw new SocialLoginFailedError(`kakao error: ${error}`);
    if (!pending) throw new SocialLoginFailedError('no pending login');
    if (params.get('state') !== pending.state) throw new SocialLoginFailedError('state mismatch');
    const code = params.get('code');
    if (!code) throw new SocialLoginFailedError('missing code');
    let idToken: string | null;
    try {
      idToken = (await exchanger.exchange(code, config.redirectUri)).idToken;
    } catch (cause) {
      if (cause instanceof SocialLoginConfigError) throw cause;
      throw new SocialLoginFailedError('code exchange failed');
    }
    if (!idToken) throw new SocialLoginConfigError('no id token');
    return { idToken, rawNonce: pending.rawNonce };
  }
}
