import { DevSessionService } from './DevSessionService';
import { UserCaches } from '../../core/auth/UserCaches';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import { parseApiBaseUrl } from '../../core/config/apiBaseUrl';
import { HttpTokenRefresher } from '../../core/net/TokenRefresher';
import { MOCK_BASE, makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { ME, NOW, loadFixture, refreshSuccessBody } from '../../test/fixtures';

function setup() {
  const env = makeApiEnv(EMPTY_SESSION);
  const refresher = new HttpTokenRefresher({ fetch: env.ff.fetch, clock: env.clock, baseUrl: parseApiBaseUrl(MOCK_BASE), logger: env.logger });
  const caches = new UserCaches();
  const cleared = { count: 0 };
  caches.register({ clear: () => void (cleared.count += 1) });
  const service = new DevSessionService({ refresher, store: env.store, userCaches: caches });
  return { ...env, service, cleared };
}

describe('DevSessionService (개발용 세션 주입, Q-02 우회)', () => {
  it('TC-AUTH-059 붙여 넣은 refresh token으로 POST /auth/refresh를 부르고 받은 토큰을 회원 세션으로 저장한다', async () => {
    const { service, ff, store } = setup();
    ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__success.json').toResponse());
    await expect(service.inject({ refreshToken: 'pasted-refresh-token', userId: ME })).resolves.toEqual({ kind: 'ok' });
    const [call] = ff.callsTo('POST /auth/refresh');
    expect(JSON.parse(call!.body as string)).toEqual({ refreshToken: 'pasted-refresh-token' });
    expect(call!.headers['authorization']).toBeUndefined();
    expect(await store.read()).toEqual({
      userId: ME,
      tokens: {
        accessToken: refreshSuccessBody.accessToken,
        accessTokenExpiresAt: NOW + (refreshSuccessBody.expiresIn as number) * 1000,
        refreshToken: refreshSuccessBody.refreshToken,
        refreshTokenExpiresAt: NOW + (refreshSuccessBody.refreshTokenExpiresIn as number) * 1000,
      },
      isGuest: false,
    });
  });

  it('TC-AUTH-059 붙여 넣은 값의 앞뒤 공백·줄바꿈은 제거해서 보낸다', async () => {
    const { service, ff } = setup();
    ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__success.json').toResponse());
    await service.inject({ refreshToken: '  pasted-refresh-token\n', userId: ` ${ME} ` });
    expect(JSON.parse(ff.callsTo('POST /auth/refresh')[0]!.body as string)).toEqual({ refreshToken: 'pasted-refresh-token' });
  });

  it('TC-AUTH-059 세션을 쓰기 전에 이전 사용자 캐시를 비운다', async () => {
    const { service, ff, cleared } = setup();
    ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__success.json').toResponse());
    await service.inject({ refreshToken: 'pasted-refresh-token', userId: ME });
    expect(cleared.count).toBe(1);
  });

  it('TC-AUTH-059 refresh token이나 userId가 비어 있으면 요청도 저장도 하지 않는다', async () => {
    const { service, ff, store } = setup();
    expect(await service.inject({ refreshToken: '   ', userId: ME })).toEqual({ kind: 'invalid_input' });
    expect(await service.inject({ refreshToken: 'pasted-refresh-token', userId: '' })).toEqual({ kind: 'invalid_input' });
    expect(ff.calls).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it('TC-AUTH-059 서버가 REAUTHENTICATION_REQUIRED로 거절하면 rejected이고 세션을 저장하지 않는다', async () => {
    const { service, ff, store } = setup();
    ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__reauthentication-required.json').toResponse());
    expect(await service.inject({ refreshToken: 'stale', userId: ME })).toEqual({ kind: 'rejected' });
    expect(store.writes).toHaveLength(0);
  });

  it('TC-AUTH-059 5xx·네트워크 오류는 failed이고 세션을 저장하지 않는다', async () => {
    for (const responder of [() => loadFixture('auth/refresh__internal-error.json').toResponse(), networkFailure]) {
      const { service, ff, store } = setup();
      ff.route('POST /auth/refresh', responder);
      const done = service.inject({ refreshToken: 'x', userId: ME });
      expect(await done).toEqual({ kind: 'failed' });
      expect(store.writes).toHaveLength(0);
    }
  });

  it('REQ-AUTH-031 로그에 붙여 넣은 refresh token이 남지 않는다', async () => {
    const { service, ff, logger } = setup();
    ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__internal-error.json').toResponse());
    await service.inject({ refreshToken: 'pasted-refresh-token', userId: ME });
    expect(logger.dump()).not.toContain('pasted-refresh-token');
  });
});
