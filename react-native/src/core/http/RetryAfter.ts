/**
 * Retry-After(초 정수 또는 HTTP 날짜)를 ms로. 음수·비숫자·과거 날짜·없음은 null(기본 백오프 사용),
 * MAX_RETRY_AFTER_MS보다 크면 상한으로 자른다.
 */
export function parseRetryAfterMs(_value: string | undefined, _now: Date): number | null {
  throw new Error('not implemented');
}

/** 재시도 n번째(0부터)의 기본 백오프 ms: 500, 1000. */
export function backoffMs(_retryIndex: number): number {
  throw new Error('not implemented');
}
