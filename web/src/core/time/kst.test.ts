import { clampDayToMonth, formatDateString, isSelectableTopicDate, isTodayKst, kstDateOf, kstStartOfDay, kstToday, nextKstMidnight, parseDateString, weekOf } from './kst';
import { FakeClock } from './FakeClock';
import { DEVICE_TIME_ZONES, withHostileLocale, withTimeZone } from './withTimeZone';

const utc = (iso: string) => Date.parse(iso);

describe('KST 날짜 계산', () => {
  it('TC-TIME-001 UTC 2026-10-26T15:00:00Z는 KST 2026-10-27이다', () => {
    expect(kstDateOf(utc('2026-10-26T15:00:00Z'))).toBe('2026-10-27');
  });

  it('TC-TIME-002 UTC 2026-10-26T14:59:59Z는 KST 2026-10-26이다', () => {
    expect(kstDateOf(utc('2026-10-26T14:59:59Z'))).toBe('2026-10-26');
    expect(kstDateOf(utc('2026-10-26T14:59:59.999Z'))).toBe('2026-10-26');
  });

  it('TC-TIME-001 kstToday는 Clock에서만 시각을 얻는다', () => {
    const clock = new FakeClock(utc('2026-10-26T15:00:00Z'));
    expect(kstToday(clock)).toBe('2026-10-27');
  });

  it.each(DEVICE_TIME_ZONES)('TC-TIME-003 기기 시간대가 %s여도 같은 순간의 KST 날짜는 같다', (tz) => {
    const instants = ['2026-10-26T14:59:59Z', '2026-10-26T15:00:00Z', '2026-12-31T14:59:59Z', '2027-01-01T00:00:00Z'];
    const expected = ['2026-10-26', '2026-10-27', '2026-12-31', '2027-01-01'];
    const actual = withTimeZone(tz, () => instants.map((i) => kstDateOf(utc(i))));
    expect(actual).toEqual(expected);
  });

  it('TC-TIME-004 서머타임 전환일(America/Los_Angeles)에도 KST 규칙으로 계산한다', () => {
    const oracle = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
    withTimeZone('America/Los_Angeles', () => {
      for (const day of ['2026-03-08', '2026-11-01']) {
        for (let h = 0; h < 48; h++) {
          const ms = utc(`${day}T00:00:00Z`) - 12 * 3_600_000 + h * 3_600_000;
          expect(kstDateOf(ms)).toBe(oracle(ms));
        }
      }
    });
  });

  it('TC-TIME-005 숫자를 ASCII가 아닌 문자로 바꾸는 로캘에서도 yyyy-MM-dd ASCII로 만든다', () => {
    const out = withHostileLocale(() => kstDateOf(utc('2026-10-26T15:00:00Z')));
    expect(out).toBe('2026-10-27');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(withHostileLocale(() => formatDateString(2026, 1, 5))).toBe('2026-01-05');
  });

  it('TC-TIME-022 주제 날짜가 KST 오늘인 경우에만 true다(어제, 자정 직전·직후)', () => {
    const clock = new FakeClock(utc('2026-10-27T14:59:59Z')); // 10-27 23:59:59 KST
    expect(isTodayKst('2026-10-27', clock)).toBe(true);
    expect(isTodayKst('2026-10-26', clock)).toBe(false);
    clock.setWallClock(utc('2026-10-27T15:00:00Z')); // 10-28 00:00:00 KST
    expect(isTodayKst('2026-10-27', clock)).toBe(false);
    expect(isTodayKst('2026-10-28', clock)).toBe(true);
  });
});

describe('날짜 문자열 유틸', () => {
  it('parseDateString/formatDateString 왕복, 0 패딩', () => {
    expect(parseDateString('2026-01-05')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(formatDateString(2026, 1, 5)).toBe('2026-01-05');
  });

  it.each(['2026-13-01', '2026-02-30', '2026-1-5', 'abc', '', '2026-10-27T00:00:00Z'])('형식·범위 오류 %j는 throw한다', (s) => {
    expect(() => parseDateString(s)).toThrow();
  });

  it('kstStartOfDay는 해당 날짜 KST 00:00의 epoch ms다', () => {
    expect(kstStartOfDay('2026-10-27')).toBe(utc('2026-10-26T15:00:00Z'));
  });

  it('nextKstMidnight는 now 이후 첫 KST 자정이다(정각이면 그다음 자정)', () => {
    expect(nextKstMidnight(utc('2026-10-27T14:59:59Z'))).toBe(utc('2026-10-27T15:00:00Z'));
    expect(nextKstMidnight(utc('2026-10-27T15:00:00Z'))).toBe(utc('2026-10-28T15:00:00Z'));
    expect(nextKstMidnight(utc('2026-10-27T03:00:00Z'))).toBe(utc('2026-10-27T15:00:00Z'));
  });
});

describe('전시 날짜 선택', () => {
  it('TC-TIME-009 FIRST_TOPIC_DATE(2026-09-17)는 선택 가능하고 09-16은 막힌다', () => {
    expect(isSelectableTopicDate('2026-09-17', '2026-10-27')).toBe(true);
    expect(isSelectableTopicDate('2026-09-16', '2026-10-27')).toBe(false);
  });

  it('TC-TIME-007 오늘은 선택 가능하고 오늘 다음 날은 선택할 수 없다', () => {
    expect(isSelectableTopicDate('2026-10-27', '2026-10-27')).toBe(true);
    expect(isSelectableTopicDate('2026-10-28', '2026-10-27')).toBe(false);
  });

  it('TC-TIME-011 31일을 30일 달로 옮기면 말일로 보정한다', () => {
    expect(clampDayToMonth(2026, 11, 31)).toBe('2026-11-30');
    expect(clampDayToMonth(2026, 10, 31)).toBe('2026-10-31');
  });

  it('TC-TIME-011 윤년 2028-02-29는 유효하고 2027-02-29는 02-28로 보정한다', () => {
    expect(clampDayToMonth(2028, 2, 29)).toBe('2028-02-29');
    expect(clampDayToMonth(2027, 2, 29)).toBe('2027-02-28');
    expect(clampDayToMonth(2100, 2, 29)).toBe('2100-02-28'); // 100의 배수는 평년
    expect(clampDayToMonth(2000, 2, 29)).toBe('2000-02-29');
  });
});

describe('주간 계산', () => {
  it('TC-TIME-012 일요일 시작 주: 2026-10-25(일)~10-31(토)', () => {
    const w = weekOf('2026-10-28');
    expect(w.days).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(w.months).toEqual(['2026-10']);
    expect(weekOf('2026-10-25').days[0]).toBe('2026-10-25'); // 일요일 자신
    expect(weekOf('2026-10-31').days[0]).toBe('2026-10-25'); // 토요일
  });

  it('TC-TIME-012 연말 경계 주(2026-12-27~2027-01-02)는 두 해·두 달에 걸친다', () => {
    const w = weekOf('2027-01-01');
    expect(w.days[0]).toBe('2026-12-27');
    expect(w.days[6]).toBe('2027-01-02');
    expect(w.months).toEqual(['2026-12', '2027-01']);
  });

  it('TC-TIME-013 월 경계 주(2026-08-30~09-05)는 두 달에 걸친다', () => {
    const w = weekOf('2026-09-02');
    expect(w.days[0]).toBe('2026-08-30');
    expect(w.months).toEqual(['2026-08', '2026-09']);
  });

  it('TC-TIME-003 주 계산도 기기 시간대와 무관하다', () => {
    for (const tz of DEVICE_TIME_ZONES) {
      expect(withTimeZone(tz, () => weekOf('2027-01-01').days[0])).toBe('2026-12-27');
    }
  });
});
