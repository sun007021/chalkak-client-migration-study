import type { HttpMethod } from './HttpTransport';
import {
  CONNECT_TIMEOUT_MS,
  MAX_RETRIES,
  PRESIGNED_PUT_TIMEOUT_MS,
  RESPONSE_TIMEOUT_MS,
  authLevelFor,
  isRefreshableRequest,
  isRetryable,
} from './RequestPolicy';

const ID = '3f1c2a52-1111-4222-8333-444455556666';

describe('RequestPolicy', () => {
  it('TC-NET-043 타임아웃 상수: 연결 10초, 응답 15초, presigned PUT 60초, 재시도 최대 2회', () => {
    expect(CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(RESPONSE_TIMEOUT_MS).toBe(15_000);
    expect(PRESIGNED_PUT_TIMEOUT_MS).toBe(60_000);
    expect(MAX_RETRIES).toBe(2);
  });

  describe('isRetryable (D-21 표 전체)', () => {
    const retryable: [HttpMethod, string][] = [
      ['GET', '/posts'],
      ['GET', '/topics'],
      ['GET', '/banners'],
      ['GET', '/notifications'],
      ['GET', `/posts/${ID}`],
      ['PUT', `/posts/${ID}`],
      ['PUT', '/users/me/signature'],
      ['PUT', '/push-devices/current'],
      ['DELETE', `/posts/${ID}`],
      ['DELETE', '/users/me'],
      ['PATCH', '/notification-settings'],
      ['PATCH', `/notifications/${ID}`],
      ['POST', '/posts/uploads'],
      ['POST', '/users/me/signature/uploads'],
    ];
    const notRetryable: [HttpMethod, string][] = [
      ['POST', '/posts'],
      ['POST', '/auth/refresh'],
      ['POST', '/feedbacks'],
      ['POST', `/posts/${ID}/ai-review`],
      ['POST', '/auth/social-login'],
      ['POST', '/auth/social-signup/signature/uploads'],
      ['POST', '/auth/social-signup'],
      ['POST', '/auth/logout'],
    ];

    it.each(retryable)('TC-NET-037 %s %s 는 재시도 대상이다', (method, path) => {
      expect(isRetryable(method, path)).toBe(true);
    });

    it.each(notRetryable)('TC-NET-038 %s %s 는 재시도하지 않는다', (method, path) => {
      expect(isRetryable(method, path)).toBe(false);
    });

    it('TC-NET-038 /auth/social-* 로 시작하는 새 경로도 재시도하지 않는다', () => {
      expect(isRetryable('POST', '/auth/social-whatever')).toBe(false);
    });
  });

  describe('authLevelFor (인증 수준 표)', () => {
    it.each<[HttpMethod, string, string]>([
      ['GET', '/posts', 'optional'],
      ['GET', '/topics', 'optional'],
      ['GET', '/banners', 'none'],
      ['POST', '/auth/refresh', 'none'],
      ['POST', '/auth/logout', 'none'],
      ['POST', '/auth/social-login', 'none'],
      ['GET', '/notifications', 'required'],
      ['GET', `/posts/${ID}`, 'required'],
      ['GET', '/posts/today', 'required'],
      ['GET', '/posts/calendar', 'required'],
      ['POST', '/posts', 'required'],
      ['DELETE', '/users/me', 'required'],
    ])('TC-NET-014 %s %s 는 %s', (method, path, level) => {
      expect(authLevelFor(method, path)).toBe(level);
    });
  });

  describe('isRefreshableRequest', () => {
    it.each<[HttpMethod, string, boolean]>([
      ['GET', '/notifications', true],
      ['GET', '/posts', true],
      ['GET', '/topics', true],
      ['GET', '/banners', false],
      ['POST', '/auth/refresh', false],
      ['POST', '/auth/social-login', false],
      ['POST', '/auth/logout', false],
    ])('TC-NET-030/031 %s %s → %s', (method, path, expected) => {
      expect(isRefreshableRequest(method, path)).toBe(expected);
    });
  });
});
