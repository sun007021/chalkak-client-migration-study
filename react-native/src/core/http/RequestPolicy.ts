import type { HttpMethod } from './HttpTransport';

/** none: 토큰 안 붙임 / optional: 있으면 붙임(공개 API) / required: 붙임(게스트는 헤더 없이 나감). */
export type AuthLevel = 'none' | 'optional' | 'required';

const UPLOAD_POLICY_PATHS: readonly string[] = ['/posts/uploads', '/users/me/signature/uploads'];

/** 경로 규약 위반(쿼리 포함, 선행 `/` 없음, 후행 `/`)은 개발 단계에서 바로 드러나게 던진다. 쿼리는 `query`로 넘긴다. */
function assertApiPath(path: string): void {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#') || path.endsWith('/')) {
    throw new Error(`잘못된 API 경로: ${path} (선행 /, 쿼리·후행 / 없음)`);
  }
}

const isAuthPath = (path: string): boolean => path === '/auth' || path.startsWith('/auth/');

/** 경로는 `/api/v1` 뒤 부분(`/posts`, `/auth/refresh` ...). 쿼리 없음. */
export function authLevelFor(method: HttpMethod, path: string): AuthLevel {
  assertApiPath(path);
  if (isAuthPath(path) || path === '/banners') return 'none';
  if (method === 'GET' && (path === '/posts' || path === '/topics')) return 'optional';
  return 'required';
}

/** 자동 재시도 허용 여부(D-21). GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST만 true. */
export function isRetryable(method: HttpMethod, path: string): boolean {
  assertApiPath(path);
  if (method !== 'POST') return true;
  return UPLOAD_POLICY_PATHS.includes(path);
}

/** 401 UNAUTHORIZED 시 토큰 갱신 대상 경로인지. 인증 수준이 none인 경로(`/auth/*`, `/banners`)는 제외. */
export function isRefreshableRequest(method: HttpMethod, path: string): boolean {
  return authLevelFor(method, path) !== 'none';
}
