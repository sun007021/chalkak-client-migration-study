import { MAX_RETRY_AFTER_MS } from './RequestPolicy';
import { backoffMs, parseRetryAfterMs } from './RetryAfter';

const NOW = new Date('2026-10-27T00:00:00.000Z');

describe('backoffMs', () => {
  it('TC-NET-037 재시도 0번째 500ms, 1번째 1000ms', () => {
    expect(backoffMs(0)).toBe(500);
    expect(backoffMs(1)).toBe(1000);
  });
});

describe('parseRetryAfterMs', () => {
  it('TC-NET-040 초 값 2는 2000ms', () => {
    expect(parseRetryAfterMs('2', NOW)).toBe(2000);
  });

  it('TC-NET-040 HTTP 날짜는 now와의 차이(ms)', () => {
    expect(parseRetryAfterMs('Tue, 27 Oct 2026 00:00:03 GMT', NOW)).toBe(3000);
  });

  it('TC-NET-040 0초는 0ms(즉시 재시도)', () => {
    expect(parseRetryAfterMs('0', NOW)).toBe(0);
  });

  it.each([
    ['음수', '-5'],
    ['비숫자', 'soon'],
    ['빈 문자열', ''],
    ['과거 날짜', 'Mon, 26 Oct 2026 23:59:00 GMT'],
    ['소수', '1.5x'],
  ])('TC-NET-041 %s는 무시(null)하고 기본 백오프를 쓰게 한다', (_n, value) => {
    expect(parseRetryAfterMs(value, NOW)).toBeNull();
  });

  it('TC-NET-041 헤더가 없으면 null', () => {
    expect(parseRetryAfterMs(undefined, NOW)).toBeNull();
  });

  it('TC-NET-041 매우 큰 값은 상한(MAX_RETRY_AFTER_MS)으로 자른다', () => {
    expect(parseRetryAfterMs('86400', NOW)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfterMs('Wed, 28 Oct 2026 00:00:00 GMT', NOW)).toBe(MAX_RETRY_AFTER_MS);
  });
});
