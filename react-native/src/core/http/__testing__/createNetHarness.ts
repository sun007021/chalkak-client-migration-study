import { ApiClient } from '../ApiClient';
import { AuthSessionEvents, type AuthSessionEvent } from '../AuthSessionEvents';
import { HttpRefreshEndpoint } from '../HttpRefreshEndpoint';
import { TokenRefresher } from '../TokenRefresher';
import { SecureSessionStore } from '../../session/SecureSessionStore';
import type { SessionCredentials } from '../../session/SessionStore';
import { FakeSecureKeyValueStorage } from '../../session/__testing__/FakeSecureKeyValueStorage';
import { FakeClock } from '../../time/FakeClock';
import { FakeNetworkLogger } from './FakeNetworkLogger';
import { FakeSleeper } from './FakeSleeper';
import { FakeTransport, json } from './FakeTransport';
import { fixtureBody, fixtureResponse } from './loadFixture';

type RefreshFixture = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

export const BASE_URL = 'https://api.test/api/v1/';

export function createNetHarness(options: { manualSleeper?: boolean; maxRetries?: number } = {}) {
  const clock = new FakeClock('2026-10-27T00:00:00.000Z');
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
    maxRetries: options.maxRetries,
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

  return {
    clock,
    transport,
    storage,
    sessionStore,
    sleeper,
    logger,
    events,
    emitted,
    api,
    tokenRefresher,
    signIn,
  };
}

export type NetHarness = ReturnType<typeof createNetHarness>;

// 토큰 문자열만 테스트용(access-2/refresh-2)으로 바꾸고 수명은 fixture 값을 쓴다.
export const REFRESH_SUCCESS = {
  ...fixtureBody<RefreshFixture>('auth/refresh__success'),
  accessToken: 'access-2',
  refreshToken: 'refresh-2',
};
export const UNAUTHORIZED_BODY = fixtureBody('common/error__unauthorized-token-invalid');
export const REAUTH_BODY = fixtureBody('auth/refresh__reauthentication-required');
export const INTERNAL_BODY = fixtureBody('common/error__internal-500');
export const BUSINESS_BODY = fixtureBody('common/error__business-400');

export const unauthorized = () => fixtureResponse('common/error__unauthorized-token-invalid');
export const reauth = () => fixtureResponse('auth/refresh__reauthentication-required');
export const refreshOk = () => json(200, REFRESH_SUCCESS);
