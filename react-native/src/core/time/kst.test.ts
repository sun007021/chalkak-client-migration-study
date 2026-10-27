import { FakeClock } from './FakeClock';
import { KstDate } from './KstDate';
import {
  WEEKDAY_HEADERS,
  calendarImageFileName,
  clampToFirstTopicDate,
  currentMonthKst,
  daysInMonth,
  formatNotificationTime,
  formatTodayTopicLabel,
  formatTopicDateLabel,
  formatYearMonth,
  isBeforeFirstTopicDate,
  isToday,
  monthsSpanned,
  moveToMonth,
  parseInstant,
  toKstDate,
  todayKst,
  weekOf,
  withCurrentMonth,
} from './kst';

const HOUR = 3_600_000;
const d = (text: string): KstDate => {
  const parsed = KstDate.parse(text);
  if (!parsed) throw new Error(`bad fixture date ${text}`);
  return parsed;
};
const ymd = (dates: readonly KstDate[]): string[] => dates.map((x) => x.toString());

/** 구현과 독립된 정답: 순간 + 9시간의 UTC 달력 날짜. */
const oracleKstDate = (instant: Date): string =>
  new Date(instant.getTime() + 9 * HOUR).toISOString().slice(0, 10);

/** 로캘 의존 API를 쓰면 실패하도록 만드는 환경(아랍어·태국어·페르시아어 로캘 기기 모사). */
function withHostileLocale(run: () => void): void {
  const spies = [
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => '٢٠٢٦/١٠/٢٧'),
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(() => '٢٥٦٩/๑๐/๒๗'),
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(() => '۱۴:۰۰'),
    // format은 접근자 프로퍼티라 getter를 가로챈다.
    jest
      .spyOn(Intl.DateTimeFormat.prototype as { format: unknown }, 'format', 'get')
      .mockImplementation(() => () => '٢٠٢٦-١٠-٢٧'),
  ];
  try {
    run();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}

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

  it('TC-TIME-003 `npm run test:tz`로 TZ를 바꿔 실행해도 실행 시간대가 실제로 적용되어 있다', () => {
    const tz = process.env.TZ;
    if (tz) {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
    }
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

describe('TIME: FIRST_TOPIC_DATE 하한', () => {
  it('TC-TIME-009 2026-09-17은 이동 가능, 2026-09-16은 막힌다', () => {
    expect(isBeforeFirstTopicDate(d('2026-09-17'))).toBe(false);
    expect(isBeforeFirstTopicDate(d('2026-09-16'))).toBe(true);
    expect(isBeforeFirstTopicDate(d('2026-09-18'))).toBe(false);
    expect(isBeforeFirstTopicDate(d('2025-12-31'))).toBe(true);
  });

  it('TC-TIME-009 clampToFirstTopicDate는 하한보다 이른 날짜만 하한으로 올린다', () => {
    expect(clampToFirstTopicDate(d('2026-09-16')).toString()).toBe('2026-09-17');
    expect(clampToFirstTopicDate(d('2026-09-17')).toString()).toBe('2026-09-17');
    expect(clampToFirstTopicDate(d('2026-10-27')).toString()).toBe('2026-10-27');
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
    expect(moveToMonth(d(from), { year, month }).toString()).toBe(expected);
  });

  it.each([
    [2026, 1, 31],
    [2026, 4, 30],
    [2026, 2, 28],
    [2028, 2, 29],
    [2100, 2, 28],
    [2000, 2, 29],
  ])('TC-TIME-011 daysInMonth(%i, %i) = %i', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected);
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
      expect(monthsSpanned(week)).toEqual([
        { year: 2026, month: 12 },
        { year: 2027, month: 1 },
      ]);
    }
  });

  it('TC-TIME-012 한 달 안에 있는 주는 달 하나만 반환', () => {
    expect(monthsSpanned(weekOf(d('2026-10-27')))).toEqual([{ year: 2026, month: 10 }]);
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
    expect(monthsSpanned(week)).toEqual([
      { year: 2025, month: 10 },
      { year: 2025, month: 11 },
    ]);
    week.forEach((day, index) => expect(day.dayOfWeek()).toBe(index));
  });

  it('TC-TIME-012 요일 머리글은 일월화수목금토 순서', () => {
    expect([...WEEKDAY_HEADERS]).toEqual(['일', '월', '화', '수', '목', '금', '토']);
  });
});

describe('TIME: 기록 탭 현재 달', () => {
  it('TC-TIME-016 KST 10/31 23:59:59는 10월, 11/1 00:00:00은 11월', () => {
    const clock = new FakeClock('2026-10-31T14:59:59Z');
    expect(currentMonthKst(clock)).toEqual({ year: 2026, month: 10 });
    clock.advance(1_000);
    expect(currentMonthKst(clock)).toEqual({ year: 2026, month: 11 });
  });

  it('TC-TIME-016 연말 자정을 넘기면 다음 해 1월', () => {
    expect(currentMonthKst(new FakeClock('2026-12-31T15:00:00Z'))).toEqual({
      year: 2027,
      month: 1,
    });
  });

  it('TC-TIME-016 월 목록에 현재 달이 없으면 최신순을 유지한 채 선택지에 넣는다', () => {
    expect(withCurrentMonth([{ year: 2026, month: 9 }], { year: 2026, month: 10 })).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 9 },
    ]);
  });

  it('TC-TIME-016 빈 목록이면 현재 달만', () => {
    expect(withCurrentMonth([], { year: 2026, month: 11 })).toEqual([{ year: 2026, month: 11 }]);
  });

  it('TC-TIME-016 이미 있으면 중복 없이 그대로', () => {
    const months = [
      { year: 2026, month: 10 },
      { year: 2026, month: 9 },
    ];
    expect(withCurrentMonth(months, { year: 2026, month: 10 })).toEqual(months);
  });

  it('TC-TIME-016 연도가 바뀌어도 최신순으로 정렬된다', () => {
    expect(
      withCurrentMonth(
        [
          { year: 2026, month: 12 },
          { year: 2026, month: 11 },
        ],
        { year: 2027, month: 1 },
      ),
    ).toEqual([
      { year: 2027, month: 1 },
      { year: 2026, month: 12 },
      { year: 2026, month: 11 },
    ]);
  });

  it('TC-TIME-016 입력 배열을 변경하지 않는다', () => {
    const months = [{ year: 2026, month: 9 }];
    withCurrentMonth(months, { year: 2026, month: 10 });
    expect(months).toEqual([{ year: 2026, month: 9 }]);
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

describe('TIME: 표시 포맷', () => {
  it.each([
    ['2026-10-20', '10월 20일의 주제'],
    ['2026-01-05', '1월 5일의 주제'],
    ['2026-12-31', '12월 31일의 주제'],
  ])('TC-TIME-023 formatTopicDateLabel(%s) = %s', (date, expected) => {
    expect(formatTopicDateLabel(d(date))).toBe(expected);
  });

  it.each([
    ['2026-10-20', '10월 20일 · 오늘의 주제'],
    ['2026-01-05', '1월 5일 · 오늘의 주제'],
    ['2026-12-31', '12월 31일 · 오늘의 주제'],
  ])('TC-TIME-023 formatTodayTopicLabel(%s) = %s', (date, expected) => {
    expect(formatTodayTopicLabel(d(date))).toBe(expected);
  });

  it.each([
    ['2026-10-20T05:00:00Z', '10월 20일 14:00'],
    ['2026-10-20T11:30:00Z', '10월 20일 20:30'], // 12시간제(오후 8:30)가 아니다
    ['2026-10-20T14:59:00Z', '10월 20일 23:59'],
    ['2026-10-20T15:00:00Z', '10월 21일 00:00'], // KST 자정
    ['2026-12-31T15:00:00Z', '1월 1일 00:00'], // 연도는 표시하지 않는다
    ['2026-01-05T00:05:00Z', '1월 5일 09:05'], // 월·일은 패딩 없음, 시·분은 2자리
    ['2026-10-20T15:00:00.999Z', '10월 21일 00:00'],
  ])('TC-TIME-024 formatNotificationTime(%s) = %s', (iso, expected) => {
    expect(formatNotificationTime(new Date(iso))).toBe(expected);
  });

  it('TC-TIME-024 시스템 로캘(아랍어·태국어·페르시아어)과 무관하게 같은 문자열', () => {
    withHostileLocale(() => {
      expect(formatNotificationTime(new Date('2026-10-20T05:00:00Z'))).toBe('10월 20일 14:00');
      expect(formatTopicDateLabel(KstDate.of(2026, 1, 5))).toBe('1월 5일의 주제');
    });
  });

  it('TC-TIME-005 달력 이미지 파일명과 연월 표기', () => {
    expect(calendarImageFileName({ year: 2026, month: 10 })).toBe('chalkak-calendar-2026-10.png');
    expect(calendarImageFileName({ year: 2026, month: 1 })).toBe('chalkak-calendar-2026-01.png');
    expect(formatYearMonth({ year: 2027, month: 3 })).toBe('2027-03');
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
  ])('TC-TIME-026 파싱할 수 없는 문자열 %j는 예외 없이 null', (text) => {
    expect(parseInstant(text)).toBeNull();
  });
});
