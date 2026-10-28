import { AuthApi } from './AuthApi';
import type { StoredSession } from '../../core/auth/SessionStore';
import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { NOW, ME, memberSession, guestSession, loadFixture } from '../../test/fixtures';

const credential = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };

function setup(session: StoredSession = guestSession) {
  const env = makeApiEnv(session);
  const authApi = new AuthApi({ api: env.client(), clock: env.clock });
  return { ...env, authApi };
}

const respond = (path: string, status?: number) => () => loadFixture(path).toResponse(status === undefined ? undefined : { status });

describe('AuthApi.socialLogin 요청 모양', () => {
  it('TC-AUTH-005 POST /auth/social-login 바디가 {provider:"KAKAO", idToken, rawNonce}뿐이고 authorizationCode 키·Authorization 헤더가 없다', async () => {
    const { ff, authApi } = setup(memberSession()); // 토큰이 저장돼 있어도 붙이지 않는다
    ff.route('POST /auth/social-login', respond('auth/social-login__login-success.json'));
    await authApi.socialLogin(credential);
    const [call] = ff.callsTo('POST /auth/social-login');
    expect(ff.calls).toHaveLength(1);
    expect(JSON.parse(call!.body as string)).toEqual({ provider: 'KAKAO', idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
    expect(call!.body as string).not.toContain('authorizationCode');
    expect(call!.headers['authorization']).toBeUndefined();
    expect(call!.headers['content-type']).toBe('application/json');
  });

  it('TC-AUTH-005 요청에는 SDK용 해시가 아니라 받은 rawNonce 원문을 그대로 보낸다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__login-success.json'));
    await authApi.socialLogin({ idToken: 't', rawNonce: 'raw-original' });
    expect(JSON.parse(ff.callsTo('POST /auth/social-login')[0]!.body as string).rawNonce).toBe('raw-original');
  });

  it('TC-AUTH-005 signal을 fetch에 전달한다(화면 이탈 시 취소 가능)', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__login-success.json'));
    const controller = new AbortController();
    await authApi.socialLogin(credential, controller.signal);
    expect(ff.calls[0]!.signal).not.toBeNull();
  });
});

describe('AuthApi.socialLogin 응답 해석', () => {
  it('TC-AUTH-006 TC-AUTH-007 LOGIN_SUCCESS는 userId와 토큰 2종을 읽고 만료 시각을 clock.nowMs() + 응답 초로 계산한다', async () => {
    const { ff, authApi } = setup();
    const body = loadFixture('auth/social-login__login-success.json').json as Record<string, unknown>;
    ff.route('POST /auth/social-login', respond('auth/social-login__login-success.json'));
    const result = await authApi.socialLogin(credential);
    expect(result).toEqual({
      kind: 'login_success',
      userId: ME,
      tokens: {
        accessToken: body.accessToken,
        accessTokenExpiresAt: NOW + 900 * 1000,
        refreshToken: body.refreshToken,
        refreshTokenExpiresAt: NOW + 2_592_000 * 1000,
      },
    });
  });

  it('TC-AUTH-007 만료 시각은 응답의 초 값에서 계산한다(수명을 하드코딩하지 않는다)', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', () =>
      Response.json({ status: 'LOGIN_SUCCESS', userId: ME, accessToken: 'a', expiresIn: 60, refreshToken: 'r', refreshTokenExpiresIn: 120 }),
    );
    const result = await authApi.socialLogin(credential);
    expect(result).toMatchObject({ kind: 'login_success', tokens: { accessTokenExpiresAt: NOW + 60_000, refreshTokenExpiresAt: NOW + 120_000 } });
  });

  it('TC-AUTH-009 SIGN_UP_REQUIRED는 status만 읽고 토큰 필드가 없어도 오류가 아니다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__sign-up-required.json'));
    await expect(authApi.socialLogin(credential)).resolves.toEqual({ kind: 'sign_up_required' });
  });

  it('TC-AUTH-011 알 수 없는 status는 InvalidResponseError이다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__unknown-status.json'));
    await expect(authApi.socialLogin(credential)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AUTH-012 LOGIN_SUCCESS인데 refreshToken이 없으면 InvalidResponseError이다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__login-success-missing-token.json'));
    await expect(authApi.socialLogin(credential)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AUTH-012 accessToken이 없어도 InvalidResponseError이다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', () => Response.json({ status: 'LOGIN_SUCCESS', userId: ME, expiresIn: 900, refreshToken: 'r', refreshTokenExpiresIn: 10 }));
    await expect(authApi.socialLogin(credential)).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('AuthApi.socialLogin 오류와 재시도', () => {
  it('TC-AUTH-020 401 UNAUTHORIZED는 ApiError로 던지고 refresh를 시도하지 않는다(저장된 세션이 있어도)', async () => {
    const { ff, authApi, expired } = setup(memberSession());
    ff.route('POST /auth/social-login', respond('auth/social-login__unauthorized.json'));
    await expect(authApi.socialLogin(credential)).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHORIZED' });
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(ff.callsTo('POST /auth/social-login')).toHaveLength(1);
    expect(expired.count).toBe(0);
  });

  it('TC-AUTH-021 TC-AUTH-022 403은 서버 message를 담은 ApiError이고 자동 재시도하지 않는다', async () => {
    for (const [file, message] of [
      ['auth/social-login__forbidden-banned.json', '차단된 소셜 계정입니다.'],
      ['auth/social-login__forbidden-withdrawn-banned.json', '탈퇴한 차단 소셜 계정입니다.'],
    ] as const) {
      const { ff, authApi } = setup();
      ff.route('POST /auth/social-login', respond(file));
      const error = await authApi.socialLogin(credential).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 403, errorCode: 'FORBIDDEN', message });
      expect(ff.callsTo('POST /auth/social-login')).toHaveLength(1);
    }
  });

  it('TC-AUTH-023 400 BUSINESS_ERROR는 ApiError(400)로 던진다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__bad-request-authcode.json'));
    await expect(authApi.socialLogin(credential)).rejects.toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
  });

  it('TC-AUTH-024 500은 요청 정확히 1회만 보내고(자동 재시도 금지) ApiError로 던진다', async () => {
    const { ff, authApi, clock } = setup();
    ff.route('POST /auth/social-login', respond('auth/social-login__internal-error.json'));
    const result = authApi.socialLogin(credential).catch((e: unknown) => e);
    await clock.advance(60_000);
    expect(await result).toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    expect(ff.callsTo('POST /auth/social-login')).toHaveLength(1);
  });

  it('TC-AUTH-025 연결 실패는 NetworkError이고 요청은 1회뿐이다', async () => {
    const { ff, authApi, clock } = setup();
    ff.route('POST /auth/social-login', networkFailure);
    const result = authApi.socialLogin(credential).catch((e: unknown) => e);
    await clock.advance(60_000);
    expect(await result).toBeInstanceOf(NetworkError);
    expect(ff.callsTo('POST /auth/social-login')).toHaveLength(1);
  });

  it('TC-AUTH-026 502 게이트웨이 HTML 응답은 errorCode 없는 ApiError(502)로 분류하고 크래시하지 않는다', async () => {
    const { ff, authApi } = setup();
    ff.route('POST /auth/social-login', () => loadFixture('common/error__bad-gateway-html.json').toResponse());
    const error = await authApi.socialLogin(credential).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, errorCode: null });
    expect(ff.callsTo('POST /auth/social-login')).toHaveLength(1);
  });
});

describe('AuthApi.logout / deleteAccount 요청 모양', () => {
  it('TC-AUTH-037 로그아웃은 POST /auth/logout 바디 {refreshToken}뿐이고 Authorization이 없으며 204를 성공으로 읽는다', async () => {
    const { ff, authApi } = setup(memberSession());
    ff.route('POST /auth/logout', respond('auth/logout__no-content.json'));
    await expect(authApi.logout('fixture-refresh-token-1')).resolves.toBeUndefined();
    const [call] = ff.callsTo('POST /auth/logout');
    expect(JSON.parse(call!.body as string)).toEqual({ refreshToken: 'fixture-refresh-token-1' });
    expect(call!.headers['authorization']).toBeUndefined();
  });

  it('TC-AUTH-037 로그아웃 500은 ApiError로 던지고 재시도하지 않는다(무시는 호출자가 한다)', async () => {
    const { ff, authApi, clock } = setup(memberSession());
    ff.route('POST /auth/logout', respond('auth/logout__internal-error.json'));
    const result = authApi.logout('fixture-refresh-token-1').catch((e: unknown) => e);
    await clock.advance(60_000);
    expect(await result).toMatchObject({ status: 500 });
    expect(ff.callsTo('POST /auth/logout')).toHaveLength(1);
  });

  it('TC-AUTH-043 탈퇴는 본문 없는 DELETE /users/me이고 Bearer 토큰을 붙이며 204를 성공으로 읽는다', async () => {
    const { ff, authApi } = setup(memberSession());
    ff.route('DELETE /users/me', respond('auth/users-me__delete-no-content.json'));
    await expect(authApi.deleteAccount()).resolves.toBeUndefined();
    const [call] = ff.callsTo('DELETE /users/me');
    expect(call!.body).toBeNull();
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call!.headers['content-type']).toBeUndefined();
  });
});

