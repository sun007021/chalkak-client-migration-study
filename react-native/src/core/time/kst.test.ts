import { HOUR, d, oracleKstDate, withHostileLocale, ymd } from './__testing__/helpers';
import { FakeClock } from './FakeClock';
import { KstDate } from './KstDate';
import {
  currentMonthKst,
  isToday,
  monthsSpanned,
  moveToMonth,
  parseInstant,
  toKstDate,
  todayKst,
  weekOf,
  withCurrentMonth,
} from './kst';
import { YearMonth } from './YearMonth';

const ym = YearMonth.of;

describe('TIME: KST 오늘 날짜', () => {
  it('TC-TIME-001 UTC 2026-10-26T15:00:00Z는 KST 오늘 2026-10-27', () => {
    expect(todayKst(new FakeClock('2026-10-26T15:00:00Z')).toString()).toBe('2026-10-27');
  });

  it('TC-TIME-002 UTC 2026-10-26T14:59:59Z는 KST 오늘 2026-10-26', () => {
    expect(todayKst(new FakeClock('2026-10-26T14:59:59Z')).toString()).toBe('2026-10-26');
  });

  it('TC-TIME-002 가상 시계를 1초 전진하면 자정을 넘어 날짜가 바뀐다', () => {
    const clock = new FakeClock('2026-10-26T14:59:59Z');
    expect(todayKst(clock).toString()).toBe('2026-10-26');
    clock.advance(1_000);
    expect(todayKst(clock).toString()).toBe('2026-10-27');
  });

  it('TC-TIME-001 toKstDate는 연말·연초 경계를 넘긴다', () => {
    expect(toKstDate(new Date('2026-12-31T15:00:00Z')).toString()).toBe('2027-01-01');
    expect(toKstDate(new Date('2026-12-31T14:59:59.999Z')).toString()).toBe('2026-12-31');
  });

  it('TC-TIME-002 toKstDate는 KST 자정 직전 밀리초(14:59:59.999Z)까지 같은 날이다', () => {
    expect(toKstDate(new Date('2026-10-26T14:59:59.999Z')).toString()).toBe('2026-10-26');
  });

  it('유효하지 않은 Date(NaN)는 RangeError', () => {
    expect(() => toKstDate(new Date(NaN))).toThrow(RangeError);
  });
});

describe('TIME: 기기 시간대·로캘 독립', () => {
  const instants = [
    '2026-10-26T15:00:00Z',
    '2026-10-26T14:59:59.999Z',
    '2026-01-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    '2028-02-28T15:00:00Z',
    '2026-06-15T12:34:56Z',
  ];

  it.each(instants)('TC-TIME-003 같은 순간 %s의 KST 날짜는 UTC+9 달력 날짜', (iso) => {
    expect(toKstDate(new Date(iso)).toString()).toBe(oracleKstDate(new Date(iso)));
  });

  // `npm run test:tz`처럼 TZ 환경변수를 줬을 때만 실행한다(없으면 skip).
  const itWithTz = process.env.TZ ? it : it.skip;
  itWithTz('TC-TIME-003 TZ를 바꿔 실행하면 실행 시간대가 실제로 적용되어 있다', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ);
  });

  it.each([
    // America/Los_Angeles 전환: 2026-03-08 10:00Z(봄), 2026-11-01 09:00Z(가을)
    ['2026-03-08T09:59:59Z', '2026-03-08'],
    ['2026-03-08T10:00:00Z', '2026-03-08'],
    ['2026-03-08T14:59:59Z', '2026-03-08'],
    ['2026-03-08T15:00:00Z', '2026-03-09'],
    ['2026-11-01T08:59:59Z', '2026-11-01'],
    ['2026-11-01T09:00:00Z', '2026-11-01'],
    ['2026-11-01T14:59:59Z', '2026-11-01'],
    ['2026-11-01T15:00:00Z', '2026-11-02'],
  ])('TC-TIME-004 서머타임 전환일 근처 %s는 KST %s', (iso, expected) => {
    expect(toKstDate(new Date(iso)).toString()).toBe(expected);
  });

  it('TC-TIME-004 전환일 전후 48시간을 1시간 간격으로 훑어도 항상 UTC+9 규칙', () => {
    for (const start of ['2026-03-07T00:00:00Z', '2026-10-31T00:00:00Z']) {
      for (let h = 0; h < 48; h += 1) {
        const instant = new Date(new Date(start).getTime() + h * HOUR);
        expect(toKstDate(instant).toString()).toBe(oracleKstDate(instant));
      }
    }
  });

  it('TC-TIME-005 아랍어·태국어(불교력)·페르시아어 로캘 환경에서도 그레고리력 ASCII yyyy-MM-dd', () => {
    withHostileLocale(() => {
      const text = todayKst(new FakeClock('2026-10-26T15:00:00Z')).toString();
      expect(text).toBe('2026-10-27');
      expect(text).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      expect(KstDate.of(2026, 1, 5).toString()).toBe('2026-01-05');
    });
  });
});

describe('TIME: 월 이동 말일 보정', () => {
  it.each([
    ['2026-10-31', 2026, 11, '2026-11-30'],
    ['2026-01-31', 2026, 2, '2026-02-28'],
    ['2028-01-31', 2028, 2, '2028-02-29'],
    ['2027-01-29', 2027, 2, '2027-02-28'],
    ['2026-10-15', 2026, 11, '2026-11-15'],
    ['2026-12-31', 2027, 1, '2027-01-31'],
    ['2026-03-31', 2026, 4, '2026-04-30'],
  ])('TC-TIME-011 %s를 %i-%i로 옮기면 %s', (from, year, month, expected) => {
    expect(moveToMonth(d(from), YearMonth.of(year, month)).toString()).toBe(expected);
  });

  it('TC-TIME-011 윤년 2028-02-29는 유효, 2027-02-29는 유효하지 않다', () => {
    expect(KstDate.parse('2028-02-29')?.toString()).toBe('2028-02-29');
    expect(KstDate.parse('2027-02-29')).toBeNull();
  });
});

describe('TIME: 주(일요일 시작)와 월 경계', () => {
  it('TC-TIME-012 2026-10-25(일)~10-31(토) 주', () => {
    for (const day of ['2026-10-25', '2026-10-27', '2026-10-31']) {
      const week = weekOf(d(day));
      expect(week).toHaveLength(7);
      expect(ymd(week)).toEqual([
        '2026-10-25',
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
      ]);
      expect(week[0].dayOfWeek()).toBe(0);
      expect(week[6].dayOfWeek()).toBe(6);
    }
  });

  it('TC-TIME-012 2026-12-27(일)~2027-01-02(토) 연말 경계 주는 두 해에 걸치고 두 달 모두 요청 대상', () => {
    for (const day of ['2026-12-27', '2026-12-31', '2027-01-01', '2027-01-02']) {
      const week = weekOf(d(day));
      expect(week[0].toString()).toBe('2026-12-27');
      expect(week[6].toString()).toBe('2027-01-02');
      expect(monthsSpanned(week)).toEqual([ym(2026, 12), ym(2027, 1)]);
    }
  });

  it('TC-TIME-012 한 달 안에 있는 주는 달 하나만 반환', () => {
    expect(monthsSpanned(weekOf(d('2026-10-27')))).toEqual([ym(2026, 10)]);
  });

  it('TC-TIME-013 10월 말~11월 초에 걸친 주는 두 달이고 요일 순서대로 놓인다', () => {
    const week = weekOf(d('2025-10-30'));
    expect(ymd(week)).toEqual([
      '2025-10-26',
      '2025-10-27',
      '2025-10-28',
      '2025-10-29',
      '2025-10-30',
      '2025-10-31',
      '2025-11-01',
    ]);
    expect(monthsSpanned(week)).toEqual([ym(2025, 10), ym(2025, 11)]);
    week.forEach((day, index) => expect(day.dayOfWeek()).toBe(index));
  });
});

describe('TIME: 기록 탭 현재 달', () => {
  it('TC-TIME-016 KST 10/31 23:59:59는 10월, 11/1 00:00:00은 11월', () => {
    const clock = new FakeClock('2026-10-31T14:59:59Z');
    expect(currentMonthKst(clock)).toEqual(ym(2026, 10));
    clock.advance(1_000);
    expect(currentMonthKst(clock)).toEqual(ym(2026, 11));
  });

  it('TC-TIME-016 연말 자정을 넘기면 다음 해 1월', () => {
    expect(currentMonthKst(new FakeClock('2026-12-31T15:00:00Z'))).toEqual(ym(2027, 1));
  });

  it('TC-TIME-016 월 목록에 현재 달이 없으면 최신순을 유지한 채 선택지에 넣는다', () => {
    expect(withCurrentMonth([ym(2026, 9)], ym(2026, 10))).toEqual([ym(2026, 10), ym(2026, 9)]);
  });

  it('TC-TIME-016 빈 목록이면 현재 달만', () => {
    expect(withCurrentMonth([], ym(2026, 11))).toEqual([ym(2026, 11)]);
  });

  it('TC-TIME-016 이미 있으면 중복 없이 그대로', () => {
    const months = [ym(2026, 10), ym(2026, 9)];
    expect(withCurrentMonth(months, ym(2026, 10))).toEqual(months);
  });

  it('TC-TIME-016 연도가 바뀌어도 최신순으로 정렬된다', () => {
    expect(withCurrentMonth([ym(2026, 12), ym(2026, 11)], ym(2027, 1))).toEqual([
      ym(2027, 1),
      ym(2026, 12),
      ym(2026, 11),
    ]);
  });

  it('TC-TIME-016 입력 배열을 변경하지 않는다', () => {
    const months = [ym(2026, 9)];
    withCurrentMonth(months, ym(2026, 10));
    expect(months).toEqual([ym(2026, 9)]);
  });
});

describe('TIME: 오늘 판정', () => {
  it.each([
    ['2026-10-27', '2026-10-26T15:00:00Z', true], // KST 00:00:00
    ['2026-10-27', '2026-10-27T14:59:59Z', true], // KST 23:59:59
    ['2026-10-27', '2026-10-27T15:00:00Z', false], // KST 다음 날 00:00:00
    ['2026-10-27', '2026-10-26T14:59:59Z', false], // KST 전날 23:59:59
    ['2026-10-26', '2026-10-27T03:00:00Z', false], // 어제
  ])('TC-TIME-022 isToday(%s) at %s = %s', (date, iso, expected) => {
    expect(isToday(d(date), new FakeClock(iso))).toBe(expected);
  });
});

describe('TIME: 서버 Instant 파싱', () => {
  const base = Date.UTC(2026, 9, 27, 15, 0, 0);

  it.each([
    ['Z', '2026-10-27T15:00:00Z', 0],
    ['+00:00', '2026-10-27T15:00:00+00:00', 0],
    ['소수초 3자리', '2026-10-27T15:00:00.123Z', 123],
    ['소수초 6자리', '2026-10-27T15:00:00.123456Z', 123],
    ['소수초 9자리', '2026-10-27T15:00:00.123456789Z', 123],
    ['소수초 3자리 + 오프셋 00:00', '2026-10-27T15:00:00.500+00:00', 500],
    ['+09:00 오프셋은 같은 순간', '2026-10-28T00:00:00+09:00', 0],
    ['-05:00 오프셋', '2026-10-27T10:00:00-05:00', 0],
    ['소수초 1자리(.5)', '2026-10-27T15:00:00.5Z', 500],
    ['윤일 2028-02-29', '2028-02-29T00:00:00Z', Date.UTC(2028, 1, 29) - base],
  ])('TC-TIME-025 %s: %s', (_label, text, extraMs) => {
    expect(parseInstant(text)?.getTime()).toBe(base + extraMs);
  });

  it.each([
    '',
    '   ',
    'not-a-date',
    '2026-13-01T00:00:00Z',
    '2026-10-27T25:00:00Z',
    '2026-10-27',
    '2026-10-27T15:00:00',
    '1793113200',
    '2026-10-27T15:00:00z', // 소문자 z
    '2026-10-27 15:00:00Z', // 공백 구분자
    '2026-10-27T15:00:60Z', // 윤초 표기
    '2027-02-29T00:00:00Z', // 없는 날짜
    '2026-10-27T15:00:00+0000', // 콜론 없는 오프셋
  ])('TC-TIME-026 파싱할 수 없는 문자열 %j는 예외 없이 null', (text) => {
    expect(parseInstant(text)).toBeNull();
  });
});
