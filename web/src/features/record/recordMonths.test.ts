import { FakeClock } from '../../test/FakeClock';
import { DEVICE_TIME_ZONES, withTimeZone } from '../../test/withTimeZone';
import { calendarFileName, currentYearMonth, mergeAvailableMonths, monthGrid, monthKey, monthLabel, monthOfDate, nearestAvailableMonth, parseMonthKey, parseRecordRoute, planRecordUrlWrite } from './recordMonths';

const ym = (year: number, month: number) => ({ year, month });
const at = (iso: string) => new FakeClock(Date.parse(iso));

describe('현재 달 계산 (D-19)', () => {
  it.each(DEVICE_TIME_ZONES)('TC-REC-005 KST 23:59:59는 10월, 자정(15:00:00Z)부터 11월이다 (기기 시간대 %s)', (tz) => {
    withTimeZone(tz, () => {
      expect(currentYearMonth(at('2026-10-31T14:59:59Z'))).toEqual(ym(2026, 10));
      expect(currentYearMonth(at('2026-10-31T15:00:00Z'))).toEqual(ym(2026, 11));
    });
  });

  it.each(DEVICE_TIME_ZONES)('TC-REC-006 연말 경계: 12/31 KST 23:59:59는 2026-12, 자정부터 2027-01이다 (기기 시간대 %s)', (tz) => {
    withTimeZone(tz, () => {
      expect(currentYearMonth(at('2026-12-31T14:59:59Z'))).toEqual(ym(2026, 12));
      expect(currentYearMonth(at('2026-12-31T15:00:00Z'))).toEqual(ym(2027, 1));
    });
  });

  it('TC-REC-005 같은 시계로 다시 부르면 시계를 따라간다(고정해 두지 않는다, REQ-REC-003)', () => {
    const clock = at('2026-10-31T14:59:59Z');
    expect(currentYearMonth(clock)).toEqual(ym(2026, 10));
    clock.setWallClock(Date.parse('2026-10-31T15:00:00Z'));
    expect(currentYearMonth(clock)).toEqual(ym(2026, 11));
  });
});

describe('월 선택지 합집합 (REQ-REC-002)', () => {
  it('TC-REC-002 서버 목록과 현재 달의 합집합을 최신순·중복 없이 만든다', () => {
    expect(mergeAvailableMonths([ym(2026, 9), ym(2026, 10), ym(2026, 9), ym(2025, 12)], ym(2026, 10))).toEqual([ym(2026, 10), ym(2026, 9), ym(2025, 12)]);
  });

  it('TC-REC-002 서버 목록이 비어도 현재 달만 선택지에 있다', () => {
    expect(mergeAvailableMonths([], ym(2026, 10))).toEqual([ym(2026, 10)]);
  });

  it('TC-REC-003 서버 목록에 현재 달이 없어도 선택지에 넣는다', () => {
    expect(mergeAvailableMonths([ym(2026, 9)], ym(2026, 10))).toEqual([ym(2026, 10), ym(2026, 9)]);
  });

  it('TC-REC-003 현재 달이 서버의 가장 최신 달보다 늦으면(월이 바뀐 뒤) 맨 앞에 온다', () => {
    expect(mergeAvailableMonths([ym(2026, 10), ym(2026, 9)], ym(2026, 11))).toEqual([ym(2026, 11), ym(2026, 10), ym(2026, 9)]);
  });
});

describe('달력 격자 계산 (REQ-REC-009, 010)', () => {
  it.each([
    ['2026-02(일 시작·28일)', ym(2026, 2), 0, 28, 4],
    ['2026-10(목 시작·31일)', ym(2026, 10), 4, 31, 5],
    ['2026-05(금 시작·31일)', ym(2026, 5), 5, 31, 6],
    ['2026-11(일 시작·30일)', ym(2026, 11), 0, 30, 5],
    ['2027-01(금 시작·31일)', ym(2027, 1), 5, 31, 6],
    ['2028-02(화 시작·29일, 윤년)', ym(2028, 2), 2, 29, 5],
  ] as const)('TC-REC-010 %s: 첫 날 오프셋·말일·행 수', (_name, month, offset, days, rows) => {
    const grid = monthGrid(month);
    expect(grid).toMatchObject({ offset, days, rows });
    expect(grid.cells).toHaveLength(rows * 7);
    expect(grid.cells[offset]).toBe(1);
    expect(grid.cells[offset + days - 1]).toBe(days);
    // 앞칸·뒤칸은 비어 있고 이전·다음 달 날짜로 채우지 않는다.
    expect(grid.cells.slice(0, offset).every((c) => c === null)).toBe(true);
    expect(grid.cells.slice(offset + days).every((c) => c === null)).toBe(true);
    expect(grid.cells.filter((c) => c !== null)).toEqual(Array.from({ length: days }, (_, i) => i + 1));
  });

  it.each(DEVICE_TIME_ZONES)('TC-REC-008 격자는 기기 시간대(%s)에 영향을 받지 않는다(주제 날짜 문자열 기준, 시간대 변환 없음)', (tz) => {
    const grids = withTimeZone(tz, () => [monthGrid(ym(2026, 10)), monthGrid(ym(2026, 11))]);
    expect(grids[0]).toMatchObject({ offset: 4, days: 31 });
    expect(grids[1]).toMatchObject({ offset: 0, days: 30 });
  });
});

describe('연도 변경 시 고를 달 (TC-REC-018)', () => {
  const multi = [ym(2026, 10), ym(2026, 9), ym(2025, 12), ym(2025, 3)];

  it('TC-REC-018 그 해에 기록이 있는 달 중 가장 가까운 달(2025에 12월·3월 기록이면 12월)', () => {
    expect(nearestAvailableMonth(multi, ym(2025, 10))).toEqual(ym(2025, 12));
    expect(nearestAvailableMonth(multi, ym(2025, 5))).toEqual(ym(2025, 3));
  });

  it('TC-REC-018 같은 거리면 더 늦은 달이다', () => {
    expect(nearestAvailableMonth([ym(2025, 9), ym(2025, 3)], ym(2025, 6))).toEqual(ym(2025, 9));
  });

  it('TC-REC-018 첫 해보다 이른 연도는 첫 해로, 마지막 해보다 늦은 연도는 마지막 해로 맞춘다', () => {
    expect(nearestAvailableMonth(multi, ym(2024, 6))).toEqual(ym(2025, 3));
    expect(nearestAvailableMonth(multi, ym(2030, 1))).toEqual(ym(2026, 9));
  });

  it('TC-REC-018 그 해에 기록이 있는 달이 target 월 자체면 그대로다', () => {
    expect(nearestAvailableMonth(multi, ym(2026, 10))).toEqual(ym(2026, 10));
  });
});

describe('월 표기·파일 이름', () => {
  it('TC-REC-038 REQ-REC-037 파일 이름은 chalkak-calendar-{yyyy-MM}.png이고 월은 두 자리다', () => {
    expect(calendarFileName(ym(2026, 10))).toBe('chalkak-calendar-2026-10.png');
    expect(calendarFileName(ym(2026, 9))).toBe('chalkak-calendar-2026-09.png');
    expect(calendarFileName(ym(2027, 1))).toBe('chalkak-calendar-2027-01.png');
  });

  it('월 라벨은 "2026년 10월"이다', () => {
    expect(monthLabel(ym(2026, 10))).toBe('2026년 10월');
    expect(monthLabel(ym(2026, 9))).toBe('2026년 9월');
  });

  it('monthKey는 yyyy-MM, parseMonthKey는 그 역이며 형식이 틀리면 null이다', () => {
    expect(monthKey(ym(2026, 9))).toBe('2026-09');
    expect(parseMonthKey('2026-10')).toEqual(ym(2026, 10));
    for (const bad of ['2026-13', '2026-00', '2026-1', '2026/10', '', 'garbage']) expect(parseMonthKey(bad), bad).toBeNull();
  });

  it('monthOfDate는 날짜 문자열의 연월을 그대로 읽는다(시간대 변환 없음)', () => {
    expect(monthOfDate('2026-10-31')).toEqual(ym(2026, 10));
    expect(monthOfDate('2026-11-01')).toEqual(ym(2026, 11));
    expect(monthOfDate('2026-02-30')).toBeNull();
    expect(monthOfDate('garbage')).toBeNull();
  });
});

describe('URL 진입·동기화 계획 (REQ-REC-032)', () => {
  it('?date=를 읽고 형식이 틀리거나 없는 날짜면 null이다', () => {
    expect(parseRecordRoute('?date=2026-09-17')).toEqual({ date: '2026-09-17' });
    expect(parseRecordRoute(new URLSearchParams({ date: '2026-09-17' }))).toEqual({ date: '2026-09-17' });
    for (const search of ['', '?date=', '?date=garbage', '?date=2026-02-30', '?date=2026-9-1', '?x=1']) expect(parseRecordRoute(search), search).toEqual({ date: null });
  });

  it('선택 날짜가 URL과 다르면 date만 덮어쓰고 다른 파라미터는 유지한다', () => {
    expect(planRecordUrlWrite('', '2026-09-17')).toBe('?date=2026-09-17');
    expect(planRecordUrlWrite('?date=2026-10-31', '2026-09-17')).toBe('?date=2026-09-17');
    expect(planRecordUrlWrite('?x=1', '2026-09-17')).toBe('?x=1&date=2026-09-17');
  });

  it('이미 같은 날짜를 가리키면 쓰지 않는다(null)', () => {
    expect(planRecordUrlWrite('?date=2026-09-17', '2026-09-17')).toBeNull();
    expect(planRecordUrlWrite('', null)).toBeNull();
  });

  it('선택이 없어지면 date 파라미터를 지운다', () => {
    expect(planRecordUrlWrite('?date=2026-09-17', null)).toBe('');
    expect(planRecordUrlWrite('?x=1&date=2026-09-17', null)).toBe('?x=1');
  });
});
