export type QueryValue = string | number | boolean | undefined | null;

/** base(끝 `/` 포함)에 path와 query를 붙인다. undefined/null 쿼리는 생략, 숫자는 로캘 무관 10진수, UUID는 소문자. */
export function buildUrl(
  _baseUrl: string,
  _path: string,
  _query?: Record<string, QueryValue>,
): string {
  throw new Error('not implemented');
}

/** JSON 바디 안의 UUID 형태 문자열을 소문자 정규형으로 바꾼 복사본을 돌려준다. */
export function normalizeBodyUuids<T>(_body: T): T {
  throw new Error('not implemented');
}

/** 쿼리 문자열을 제거한 URL(로그용). */
export function stripQuery(_url: string): string {
  throw new Error('not implemented');
}
