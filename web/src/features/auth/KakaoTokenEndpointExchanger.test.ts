import { KAKAO_TOKEN_URL, KakaoTokenEndpointExchanger } from './KakaoWebLoginClient';
import { SocialLoginConfigError, SocialLoginFailedError } from './SocialLoginClient';
import { FakeClock, flushAsync } from '../../test/FakeClock';
import { FakeFetch, jsonResponse } from '../../test/fakeFetch';

function setup(clientId = 'rest-key') {
  const clock = new FakeClock();
  const ff = new FakeFetch();
  const exchanger = new KakaoTokenEndpointExchanger({ clientId, fetch: ff.fetch, clock });
  return { clock, ff, exchanger };
}

describe('KakaoTokenEndpointExchanger (인가 코드 → ID 토큰)', () => {
  it('TC-AUTH-004 토큰 엔드포인트에 grant_type, client_id, redirect_uri, code를 form으로 POST하고 id_token을 돌려준다', async () => {
    const { ff, exchanger } = setup();
    ff.route('POST /oauth/token', () => jsonResponse(200, { id_token: 'kakao-id-token', access_token: 'ignored' }));
    await expect(exchanger.exchange('auth-code', 'https://app.test/login/kakao-callback')).resolves.toEqual({ idToken: 'kakao-id-token' });
    const [call] = ff.calls;
    expect(call!.url).toBe(KAKAO_TOKEN_URL);
    expect(call!.headers['content-type']).toContain('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(String(call!.body)))).toEqual({
      grant_type: 'authorization_code',
      client_id: 'rest-key',
      redirect_uri: 'https://app.test/login/kakao-callback',
      code: 'auth-code',
    });
  });

  it('TC-AUTH-018 id_token이 없으면 null이다', async () => {
    const { ff, exchanger } = setup();
    ff.route('POST /oauth/token', () => jsonResponse(200, { access_token: 'only' }));
    await expect(exchanger.exchange('c', 'https://app.test/cb')).resolves.toEqual({ idToken: null });
  });

  it('TC-AUTH-018 키가 없으면 요청 없이 SocialLoginConfigError이다', async () => {
    const { ff, exchanger } = setup('');
    await expect(exchanger.exchange('c', 'https://app.test/cb')).rejects.toBeInstanceOf(SocialLoginConfigError);
    expect(ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-019 HTTP 오류는 SocialLoginFailedError이다', async () => {
    const { ff, exchanger } = setup();
    ff.route('POST /oauth/token', () => jsonResponse(400, { error: 'invalid_grant' }));
    await expect(exchanger.exchange('c', 'https://app.test/cb')).rejects.toBeInstanceOf(SocialLoginFailedError);
  });

  it('D-21 응답이 15초 안에 오지 않으면 요청을 취소하고 SocialLoginFailedError이다', async () => {
    const { ff, clock, exchanger } = setup();
    ff.route('POST /oauth/token', () => new Promise<Response>(() => {}));
    const result = exchanger.exchange('c', 'https://app.test/cb').catch((e: unknown) => e);
    await flushAsync();
    await clock.advance(14_999);
    expect(ff.calls[0]!.signal?.aborted).toBe(false);
    await clock.advance(1);
    expect(await result).toBeInstanceOf(SocialLoginFailedError);
    expect(ff.calls[0]!.signal?.aborted).toBe(true);
  });

  it('응답이 오면 타임아웃 타이머를 정리한다', async () => {
    const { ff, clock, exchanger } = setup();
    ff.route('POST /oauth/token', () => jsonResponse(200, { id_token: 't' }));
    await exchanger.exchange('c', 'https://app.test/cb');
    expect(clock.pendingTimers).toBe(0);
  });

  it('호출자의 signal이 abort되면 요청도 취소되고 AbortError로 거절된다', async () => {
    const { ff, clock, exchanger } = setup();
    ff.route('POST /oauth/token', () => new Promise<Response>(() => {}));
    const controller = new AbortController();
    const result = exchanger.exchange('c', 'https://app.test/cb', controller.signal).catch((e: unknown) => e);
    await flushAsync();
    controller.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(ff.calls[0]!.signal?.aborted).toBe(true);
    expect(clock.pendingTimers).toBe(0);
  });
});
