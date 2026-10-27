import type { SessionCredentials, SessionState } from '../session/SessionStore';
import { authorizationHeaderFor } from './AuthHeaderPolicy';

const NOW = new Date('2026-10-27T00:00:00.000Z');
const credentials = (accessExpiresInMs: number): SessionCredentials => ({
  userId: 'u',
  accessToken: 'tok',
  accessTokenExpiresAt: new Date(NOW.getTime() + accessExpiresInMs),
  refreshToken: 'r',
  refreshTokenExpiresAt: new Date(NOW.getTime() + 1e9),
});
const authed = (ms: number): SessionState => ({
  kind: 'authenticated',
  credentials: credentials(ms),
});
const URL_OK = 'https://api.test/api/v1/notifications';

describe('authorizationHeaderFor', () => {
  it('만료 전 access token은 Bearer 헤더 값이 된다', () => {
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'required', session: authed(1000), now: NOW }),
    ).toBe('Bearer tok');
  });

  it('TC-AUTH-054 TC-NET-014 만료 시각이 now 이하이면 헤더를 붙이지 않는다(경계 포함)', () => {
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'required', session: authed(0), now: NOW }),
    ).toBeUndefined();
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'required', session: authed(-1), now: NOW }),
    ).toBeUndefined();
  });

  it.each([
    ['guest', { kind: 'guest' }],
    ['none', { kind: 'none' }],
  ] as const)('TC-NET-013 %s는 헤더 없음', (_n, session) => {
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'required', session, now: NOW }),
    ).toBeUndefined();
  });

  it('level none(/auth/*, /banners)은 토큰이 있어도 붙이지 않는다', () => {
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'none', session: authed(1000), now: NOW }),
    ).toBeUndefined();
  });

  it('level optional은 토큰이 있으면 붙인다', () => {
    expect(
      authorizationHeaderFor({ url: URL_OK, level: 'optional', session: authed(1000), now: NOW }),
    ).toBe('Bearer tok');
  });

  it('TC-NET-051 http(비 TLS) URL에는 붙이지 않는다', () => {
    expect(
      authorizationHeaderFor({
        url: 'http://api.test/api/v1/notifications',
        level: 'required',
        session: authed(1000),
        now: NOW,
      }),
    ).toBeUndefined();
  });
});
