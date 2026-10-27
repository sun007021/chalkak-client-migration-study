import { InvalidInstantError, parseInstant } from './instant';

const EXPECTED = Date.UTC(2026, 9, 20, 5, 0, 0);

describe('parseInstant', () => {
  it.each([
    ['Z', '2026-10-20T05:00:00Z', EXPECTED],
    ['+00:00', '2026-10-20T05:00:00+00:00', EXPECTED],
    ['소수 초 3자리', '2026-10-20T05:00:00.123Z', EXPECTED + 123],
    ['소수 초 6자리', '2026-10-20T05:00:00.123456Z', EXPECTED + 123],
    ['소수 초 9자리', '2026-10-20T05:00:00.123456789Z', EXPECTED + 123],
    ['소수 초 6자리 +00:00', '2026-10-20T05:00:00.500000+00:00', EXPECTED + 500],
    ['소수 초 1자리', '2026-10-20T05:00:00.5Z', EXPECTED + 500],
  ])('TC-TIME-025 %s 형식을 같은 순간으로 파싱한다', (_n, input, expected) => {
    expect(parseInstant(input)).toBe(expected);
  });

  it('TC-TIME-025 같은 순간의 표기들이 모두 같은 값이다', () => {
    const values = ['2026-10-20T05:00:00Z', '2026-10-20T05:00:00+00:00', '2026-10-20T05:00:00.000Z', '2026-10-20T05:00:00.000000Z', '2026-10-20T05:00:00.000000000Z'].map(parseInstant);
    expect(new Set(values).size).toBe(1);
  });

  it.each(['', 'not-a-date', '2026-10-20', '2026-13-20T05:00:00Z', '2026-10-20 05:00:00Z', '2026-10-20T25:00:00Z', '1760936400'])('TC-TIME-026 파싱할 수 없는 %j는 InvalidInstantError다', (input) => {
    expect(() => parseInstant(input)).toThrow(InvalidInstantError);
  });
});
