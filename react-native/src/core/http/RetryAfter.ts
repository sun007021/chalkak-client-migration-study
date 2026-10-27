import { RETRY_BACKOFF_MS } from '../../shared/constants';

const HTTP_DATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Retry-After(초 정수 또는 HTTP 날짜)를 ms로. 음수·비숫자·과거 날짜·없음은 null(호출자가 정책에 따라 처리).
 * 상한은 여기서 자르지 않는다: 호출자가 MAX_RETRY_AFTER_MS와 비교해 재시도 자체를 포기한다.
 */
export function parseRetryAfterMs(value: string | undefined, now: Date): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  if (!HTTP_DATE.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  const diff = at - now.getTime();
  return diff < 0 ? null : diff;
}

/** 재시도 n번째(0부터)의 기본 백오프 ms: 500, 1000. */
export function backoffMs(retryIndex: number): number {
  return RETRY_BACKOFF_MS[Math.min(retryIndex, RETRY_BACKOFF_MS.length - 1)];
}
