import { KAKAO_AUTHORIZE_URL, KAKAO_LOGIN_STORAGE_KEY, KakaoWebLoginClient } from './KakaoWebLoginClient';
import type { KakaoCodeExchanger } from './KakaoWebLoginClient';
import { sha256Hex } from './nonce';
import type { NonceGenerator } from './nonce';
import { SocialLoginCancelledError, SocialLoginConfigError, SocialLoginFailedError } from './SocialLoginClient';
import { flushAsync } from '../../test/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';

const REDIRECT_URI = 'https://app.test/login/kakao-callback';

class CountingNonce implements NonceGenerator {
  private n = 0;
  generate(): string {
    this.n += 1;
    return `raw-nonce-${this.n}`;
  }
}

class FakeExchanger implements KakaoCodeExchanger {
  readonly calls: { code: string; redirectUri: string }[] = [];
  result: Promise<{ idToken: string | null }> = Promise.resolve({ idToken: 'kakao-id-token' });
  exchange(code: string, redirectUri: string) {
    this.calls.push({ code, redirectUri });
    return this.result;
  }
}

function setup() {
  sessionStorage.clear();
  localStorage.clear();
  const redirects: string[] = [];
  const exchanger = new FakeExchanger();
  const client = new KakaoWebLoginClient({
    config: { clientId: 'test-client-id', redirectUri: REDIRECT_URI },
    nonce: new CountingNonce(),
    state: new SequentialIdGenerator(),
    storage: sessionStorage,
    redirect: (url) => void redirects.push(url),
    exchanger,
  });
  /** login()은 페이지를 떠나므로 끝나지 않는다. 리다이렉트 직전까지만 진행시킨다. */
  const startLogin = async () => {
    void client.login();
    await flushAsync();
    return new URL(redirects.at(-1)!);
  };
  const stored = () => JSON.parse(sessionStorage.getItem(KAKAO_LOGIN_STORAGE_KEY) ?? 'null') as { rawNonce: string; state: string } | null;
  return { client, redirects, exchanger, startLogin, stored };
}

describe('KakaoWebLoginClient.login (카카오 OIDC 인가 리다이렉트)', () => {
  it('TC-AUTH-003 TC-AUTH-004 인가 URL의 nonce는 SHA-256(rawNonce) 소문자 hex이고 rawNonce 원문은 URL에 나가지 않는다', async () => {
    const { startLogin, stored } = setup();
    const url = await startLogin();
    expect(stored()?.rawNonce).toBe('raw-nonce-1');
    expect(url.searchParams.get('nonce')).toBe(await sha256Hex('raw-nonce-1'));
    expect(url.searchParams.get('nonce')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain('raw-nonce-1');
  });

  it('카카오 인가 엔드포인트로 client_id, redirect_uri, response_type=code, scope=openid, state를 보낸다', async () => {
    const { startLogin, stored } = setup();
    const url = await startLogin();
    expect(`${url.origin}${url.pathname}`).toBe(KAKAO_AUTHORIZE_URL);
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(stored()?.state);
    expect(url.searchParams.get('state')).not.toBe('');
  });

  it('TC-AUTH-002 누를 때마다 새 rawNonce와 새 state를 만든다', async () => {
    const { startLogin, stored } = setup();
    const first = await startLogin();
    const firstStored = stored();
    const second = await startLogin();
    expect(stored()?.rawNonce).not.toBe(firstStored?.rawNonce);
    expect(stored()?.state).not.toBe(firstStored?.state);
    expect(second.searchParams.get('nonce')).not.toBe(first.searchParams.get('nonce'));
  });

  it('REQ-AUTH-004 rawNonce는 sessionStorage에만 두고 localStorage에는 어떤 값도 쓰지 않는다', async () => {
    const { startLogin } = setup();
    await startLogin();
    expect(localStorage.length).toBe(0);
  });
});

describe('KakaoWebLoginClient.resume (콜백 처리)', () => {
  const callback = (state: string, extra = 'code=auth-code') => `${REDIRECT_URI}?${extra}&state=${encodeURIComponent(state)}`;

  it('TC-AUTH-004 state가 맞으면 인가 코드로 ID 토큰을 받아 보관해 둔 rawNonce(원문)와 함께 돌려준다', async () => {
    const { startLogin, stored, client, exchanger } = setup();
    await startLogin();
    const { state, rawNonce } = stored()!;
    await expect(client.resume(callback(state))).resolves.toEqual({ idToken: 'kakao-id-token', rawNonce });
    expect(exchanger.calls).toEqual([{ code: 'auth-code', redirectUri: REDIRECT_URI }]);
  });

  it('rawNonce·state는 1회 사용 후 삭제되어 같은 콜백을 다시 처리하면 실패한다', async () => {
    const { startLogin, stored, client, exchanger } = setup();
    await startLogin();
    const { state } = stored()!;
    await client.resume(callback(state));
    expect(sessionStorage.getItem(KAKAO_LOGIN_STORAGE_KEY)).toBeNull();
    await expect(client.resume(callback(state))).rejects.toBeInstanceOf(SocialLoginFailedError);
    expect(exchanger.calls).toHaveLength(1);
  });

  it('state가 다르면 코드를 교환하지 않고 실패하며 보관값도 지운다(CSRF)', async () => {
    const { startLogin, client, exchanger } = setup();
    await startLogin();
    await expect(client.resume(callback('forged-state'))).rejects.toBeInstanceOf(SocialLoginFailedError);
    expect(exchanger.calls).toHaveLength(0);
    expect(sessionStorage.getItem(KAKAO_LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('보관된 로그인 시도가 없으면(새 탭, 만료, 이미 사용) 실패한다', async () => {
    const { client, exchanger } = setup();
    await expect(client.resume(callback('anything'))).rejects.toBeInstanceOf(SocialLoginFailedError);
    expect(exchanger.calls).toHaveLength(0);
  });

  it('TC-AUTH-013 사용자가 카카오 화면에서 취소(error=access_denied)하면 취소 오류이고 보관값은 지운다', async () => {
    const { startLogin, stored, client, exchanger } = setup();
    await startLogin();
    const { state } = stored()!;
    await expect(client.resume(`${REDIRECT_URI}?error=access_denied&error_description=user+cancelled&state=${state}`)).rejects.toBeInstanceOf(SocialLoginCancelledError);
    expect(exchanger.calls).toHaveLength(0);
    expect(sessionStorage.getItem(KAKAO_LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('TC-AUTH-019 그 밖의 error 파라미터는 일반 실패이다', async () => {
    const { startLogin, stored, client } = setup();
    await startLogin();
    const { state } = stored()!;
    await expect(client.resume(`${REDIRECT_URI}?error=server_error&state=${state}`)).rejects.toBeInstanceOf(SocialLoginFailedError);
  });

  it('code가 없으면 일반 실패이다', async () => {
    const { startLogin, stored, client } = setup();
    await startLogin();
    const { state } = stored()!;
    await expect(client.resume(`${REDIRECT_URI}?state=${state}`)).rejects.toBeInstanceOf(SocialLoginFailedError);
  });

  it('TC-AUTH-018 교환 결과에 idToken이 없으면 설정 오류(SocialLoginConfigError)이다', async () => {
    const { startLogin, stored, client, exchanger } = setup();
    exchanger.result = Promise.resolve({ idToken: null });
    await startLogin();
    await expect(client.resume(callback(stored()!.state))).rejects.toBeInstanceOf(SocialLoginConfigError);
  });

  it('TC-AUTH-019 코드 교환이 실패하면 일반 실패이고 보관값은 지운다', async () => {
    const { startLogin, stored, client, exchanger } = setup();
    await startLogin();
    exchanger.result = Promise.reject(new Error('token endpoint down'));
    exchanger.result.catch(() => {});
    await expect(client.resume(callback(stored()!.state))).rejects.toBeInstanceOf(SocialLoginFailedError);
    expect(sessionStorage.getItem(KAKAO_LOGIN_STORAGE_KEY)).toBeNull();
  });
});
