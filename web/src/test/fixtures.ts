import type { AuthTokens, StoredSession } from '../core/auth/SessionStore';

/** common-infra 카탈로그의 fixture를 인라인으로 옮긴 것. shared/fixtures가 생기면 그쪽을 읽도록 바꾼다. */
export const errorBodies = {
  business400: { errorCode: 'BUSINESS_ERROR', message: '조회 조건이 올바르지 않습니다.' },
  unknownCode: { errorCode: 'SOMETHING_NEW', message: '새로운 오류입니다.' },
  resourceStateChanged: { errorCode: 'RESOURCE_STATE_CHANGED', message: '상태가 변경되었습니다.' },
  metricsAggregation: { errorCode: 'USER_METRICS_AGGREGATION_IN_PROGRESS', message: '집계 중입니다.' },
  unauthorized: { errorCode: 'UNAUTHORIZED', message: '유효하지 않은 인증 정보입니다.' },
  reauth: { errorCode: 'REAUTHENTICATION_REQUIRED', message: '다시 로그인해 주세요.' },
  forbiddenBanned: { errorCode: 'FORBIDDEN', message: '차단된 회원입니다.' },
  forbiddenNoPermission: { errorCode: 'FORBIDDEN', message: '접근 권한이 없습니다.' },
  notFoundApi: { errorCode: 'BUSINESS_ERROR', message: '요청한 API를 찾을 수 없습니다.' },
  validationFormat: { errorCode: 'BUSINESS_ERROR', message: 'date: 요청 값의 형식이 올바르지 않습니다.' },
  internal500: { errorCode: 'INTERNAL_ERROR', message: '서버에서 요청을 처리하지 못했습니다.' },
} as const;

export const gatewayHtml = '<html><body><h1>502 Bad Gateway</h1></body></html>';

export const refreshSuccessBody = {
  accessToken: 'access-2',
  expiresIn: 900,
  refreshToken: 'refresh-2',
  refreshTokenExpiresIn: 2_592_000,
} as const;

export const NOW = Date.UTC(2026, 9, 27, 3, 0, 0); // 2026-10-27 12:00 KST

export function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-1',
    accessTokenExpiresAt: NOW + 900_000,
    refreshToken: 'refresh-1',
    refreshTokenExpiresAt: NOW + 2_592_000_000,
    ...overrides,
  };
}

export function memberSession(overrides: Partial<AuthTokens> = {}): StoredSession {
  return { userId: 'user-1', tokens: tokens(overrides), isGuest: false };
}

export const guestSession: StoredSession = { userId: null, tokens: null, isGuest: true };

export const BASE = '/api/v1/';
