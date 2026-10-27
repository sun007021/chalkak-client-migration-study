import { ApiClient } from '../ApiClient';
import { AuthSessionEvents, type AuthSessionEvent } from '../AuthSessionEvents';
import { HttpRefreshEndpoint } from '../HttpRefreshEndpoint';
import { TokenRefresher } from '../TokenRefresher';
import { SecureSessionStore } from '../../session/SecureSessionStore';
import type { SessionCredentials } from '../../session/SessionStore';
import { FakeSecureKeyValueStorage } from '../../session/__testing__/FakeSecureKeyValueStorage';
import { FakeClock } from './FakeClock';
import { FakeNetworkLogger } from './FakeNetworkLogger';
import { FakeSleeper } from './FakeSleeper';
import { FakeTransport, json } from './FakeTransport';

export const BASE_URL = 'https://api.test/api/v1/';

export function createNetHarness(options: { manualSleeper?: boolean } = {}) {
  const clock = new FakeClock();
  const transport = new FakeTransport();
  const storage = new FakeSecureKeyValueStorage();
  const sessionStore = new SecureSessionStore(storage);
  const sleeper = new FakeSleeper(options.manualSleeper ?? false);
  const logger = new FakeNetworkLogger();
  const events = new AuthSessionEvents();
  const emitted: AuthSessionEvent[] = [];
  events.subscribe((e) => emitted.push(e));
  const endpoint = new HttpRefreshEndpoint({ transport, baseUrl: BASE_URL });
  const tokenRefresher = new TokenRefresher({ sessionStore, endpoint, clock, events, logger });
  const api = new ApiClient({
    baseUrl: BASE_URL,
    transport,
    sessionStore,
    tokenRefresher,
    events,
    sleeper,
    clock,
    logger,
  });

  /** 인증 세션을 저장해 둔다. 기본: access 15분, refresh 30일 남음. */
  async function signIn(overrides: Partial<SessionCredentials> = {}): Promise<SessionCredentials> {
    const now = clock.now().getTime();
    const credentials: SessionCredentials = {
      userId: 'user-a',
      accessToken: 'access-1',
      accessTokenExpiresAt: new Date(now + 900_000),
      refreshToken: 'refresh-1',
      refreshTokenExpiresAt: new Date(now + 2_592_000_000),
      ...overrides,
    };
    await sessionStore.saveAuthenticated(credentials);
    return credentials;
  }

  return { clock, transport, storage, sessionStore, sleeper, logger, events, emitted, api, signIn };
}

export type NetHarness = ReturnType<typeof createNetHarness>;

// fixture: auth/refresh__success.json
export const REFRESH_SUCCESS = {
  accessToken: 'access-2',
  expiresIn: 900,
  refreshToken: 'refresh-2',
  refreshTokenExpiresIn: 2592000,
};
// fixture: common/error__unauthorized-token-invalid.json
export const UNAUTHORIZED_BODY = {
  errorCode: 'UNAUTHORIZED',
  message: '유효하지 않은 인증 정보입니다.',
};
// fixture: auth/refresh__reauthentication-required.json
export const REAUTH_BODY = {
  errorCode: 'REAUTHENTICATION_REQUIRED',
  message: '다시 로그인해 주세요.',
};
// fixture: common/error__internal-500.json
export const INTERNAL_BODY = {
  errorCode: 'INTERNAL_ERROR',
  message: '서버에서 요청을 처리하지 못했습니다.',
};
// fixture: common/error__business-400.json
export const BUSINESS_BODY = { errorCode: 'BUSINESS_ERROR', message: '요청을 처리할 수 없습니다.' };

export const unauthorized = () => json(401, UNAUTHORIZED_BODY);
export const reauth = () => json(401, REAUTH_BODY);
export const refreshOk = () => json(200, REFRESH_SUCCESS);
