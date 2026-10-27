import type { HttpMethod } from './HttpTransport';

/** none: 토큰 안 붙임 / optional: 있으면 붙임(공개 API) / required: 붙임(게스트는 헤더 없이 나감). */
export type AuthLevel = 'none' | 'optional' | 'required';

/**
 * Retry-After가 이보다 길면 재시도를 포기하고 실패로 돌려준다(자르지 않음).
 * RN 로컬 상수다. 다른 플랫폼과 맞출 후보(shared/constants.json 승격 검토).
 * 타임아웃·백오프·재시도 횟수는 shared/constants(src/shared/constants.ts)의 값을 직접 쓴다.
 */
export const MAX_RETRY_AFTER_MS = 10_000;

const UPLOAD_POLICY_PATHS: readonly string[] = ['/posts/uploads', '/users/me/signature/uploads'];

const isAuthPath = (path: string): boolean => path === '/auth' || path.startsWith('/auth/');

/** 경로는 `/api/v1` 뒤 부분(`/posts`, `/auth/refresh` ...). 쿼리 없음. */
export function authLevelFor(method: HttpMethod, path: string): AuthLevel {
  if (isAuthPath(path) || path === '/banners') return 'none';
  if (method === 'GET' && (path === '/posts' || path === '/topics')) return 'optional';
  return 'required';
}

/** 자동 재시도 허용 여부(D-21). GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST만 true. */
export function isRetryable(method: HttpMethod, path: string): boolean {
  if (method !== 'POST') return true;
  return UPLOAD_POLICY_PATHS.includes(path);
}

/** 401 UNAUTHORIZED 시 토큰 갱신 대상 경로인지(`/auth/*`, `/banners` 제외). */
export function isRefreshableRequest(_method: HttpMethod, path: string): boolean {
  return !isAuthPath(path) && path !== '/banners';
}
