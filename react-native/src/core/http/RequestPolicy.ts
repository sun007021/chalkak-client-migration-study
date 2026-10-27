import type { HttpMethod } from './HttpTransport';

/** none: 토큰 안 붙임 / optional: 있으면 붙임(공개 API) / required: 붙임(게스트는 헤더 없이 나감). */
export type AuthLevel = 'none' | 'optional' | 'required';

export const CONNECT_TIMEOUT_MS = 10_000;
export const RESPONSE_TIMEOUT_MS = 15_000;
export const PRESIGNED_PUT_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 500; // 0.5s, 1s
export const MAX_RETRY_AFTER_MS = 10_000;

/** 경로는 `/api/v1` 뒤 부분(`/posts`, `/auth/refresh` ...). 쿼리 없음. */
export function authLevelFor(_method: HttpMethod, _path: string): AuthLevel {
  throw new Error('not implemented');
}

/** 자동 재시도 허용 여부(D-21). GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST만 true. */
export function isRetryable(_method: HttpMethod, _path: string): boolean {
  throw new Error('not implemented');
}

/** 401 UNAUTHORIZED 시 토큰 갱신 대상 경로인지(`/auth/*`, `/banners` 제외). */
export function isRefreshableRequest(_method: HttpMethod, _path: string): boolean {
  throw new Error('not implemented');
}
