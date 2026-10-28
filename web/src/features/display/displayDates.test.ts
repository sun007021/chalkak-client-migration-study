import { FIRST_TOPIC_DATE } from '../../constants';
import { clampDisplayDate, displaySentinelIndex, isArchiveDate, normalizePickedDate, parseDisplayRoute, pickerOptions, shiftDate, toPickedDate } from './displayDates';

const TODAY = '2026-10-27';

describe('날짜 범위와 이동 (D-12, REQ-DISP-005, 006)', () => {
  it('TC-DISP-028 하한은 FIRST_TOPIC_DATE(2026-09-17)이고 범위 밖 날짜는 가장 가까운 끝으로 맞춘다', () => {
    expect(FIRST_TOPIC_DATE).toBe('2026-09-17');
    expect(clampDisplayDate('2026-09-16', TODAY)).toBe('2026-09-17');
    expect(clampDisplayDate('2026-09-01', TODAY)).toBe('2026-09-17');
    expect(clampDisplayDate('2020-01-01', TODAY)).toBe('2026-09-17');
    expect(clampDisplayDate('2026-09-17', TODAY)).toBe('2026-09-17');
    expect(clampDisplayDate('2026-09-18', TODAY)).toBe('2026-09-18');
  });

  it('TC-DISP-029 상한은 KST 오늘이고 미래 날짜는 오늘로 맞춘다', () => {
    expect(clampDisplayDate('2026-10-28', TODAY)).toBe(TODAY);
    expect(clampDisplayDate('2027-01-01', TODAY)).toBe(TODAY);
    expect(clampDisplayDate('2026-10-26', TODAY)).toBe('2026-10-26');
    expect(shiftDate('2026-10-26', 1)).toBe(TODAY);
  });

  it('TC-DISP-028 2026-09-18에서 하루 전은 최초 전시일이다', () => {
    expect(shiftDate('2026-09-18', -1)).toBe('2026-09-17');
  });

  it.each([
    ['2026-10-01', -1, '2026-09-30'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-10-27', 0, '2026-10-27'],
  ])('TC-DISP-030 shiftDate(%s, %i) = %s (월·연·윤년 경계도 정확한 yyyy-MM-dd)', (date, days, expected) => {
    expect(shiftDate(date, days)).toBe(expected);
  });

  it('REQ-DISP-004 지난 날짜(date < today)만 아카이브다', () => {
    expect(isArchiveDate('2026-10-26', TODAY)).toBe(true);
    expect(isArchiveDate('2026-09-17', TODAY)).toBe(true);
    expect(isArchiveDate(TODAY, TODAY)).toBe(false);
  });

  it('toPickedDate는 yyyy-MM-dd를 년·월·일로 나누고 형식 오류는 null이다', () => {
    expect(toPickedDate('2026-09-07')).toEqual({ year: 2026, month: 9, day: 7 });
    expect(toPickedDate('2026-9-7')).toBeNull();
    expect(toPickedDate('2026-02-30')).toBeNull();
    expect(toPickedDate('garbage')).toBeNull();
  });
});

describe('날짜 선택기 범위 (REQ-DISP-007, 008)', () => {
  it('TC-DISP-036 첫 해(= 마지막 해)는 하한 달부터 오늘 달까지, 첫 달은 17일부터, 마지막 달은 오늘까지, 사이 달은 말일까지다', () => {
    expect(pickerOptions({ year: 2026, month: 10 }, TODAY)).toEqual({
      years: [2026],
      months: [9, 10],
      days: Array.from({ length: 27 }, (_, i) => i + 1),
    });
    expect(pickerOptions({ year: 2026, month: 9 }, TODAY).days).toEqual(Array.from({ length: 14 }, (_, i) => i + 17)); // 17~30
  });

  it('TC-DISP-036 해가 둘이면 첫 해는 9월~12월, 마지막 해는 1월~오늘 달이고 사이 달은 말일(31일)까지다', () => {
    const today = '2027-02-10';
    expect(pickerOptions({ year: 2026, month: 12 }, today)).toMatchObject({ years: [2026, 2027], months: [9, 10, 11, 12] });
    expect(pickerOptions({ year: 2026, month: 12 }, today).days).toHaveLength(31);
    expect(pickerOptions({ year: 2027, month: 2 }, today)).toMatchObject({ months: [1, 2], days: Array.from({ length: 10 }, (_, i) => i + 1) });
    expect(pickerOptions({ year: 2026, month: 11 }, today).days).toHaveLength(30);
  });

  it('TC-DISP-036 하한 달과 오늘 달이 같으면 그 안(17일~오늘)만 나온다', () => {
    expect(pickerOptions({ year: 2026, month: 9 }, '2026-09-20')).toEqual({ years: [2026], months: [9], days: [17, 18, 19, 20] });
  });

  it('TC-DISP-036 윤년 2월은 29일, 평년 2월은 28일까지다', () => {
    expect(pickerOptions({ year: 2028, month: 2 }, '2028-03-05').days).toHaveLength(29);
    expect(pickerOptions({ year: 2027, month: 2 }, '2028-03-05').days).toHaveLength(28);
  });
});

describe('날짜 선택 보정 (REQ-DISP-009)', () => {
  it.each([
    [{ year: 2026, month: 9, day: 1 }, '2026-09-17'],
    [{ year: 2026, month: 8, day: 31 }, '2026-09-17'],
    [{ year: 2025, month: 12, day: 31 }, '2026-09-17'],
    [{ year: 2026, month: 10, day: 28 }, TODAY],
    [{ year: 2026, month: 11, day: 1 }, TODAY],
    [{ year: 2027, month: 1, day: 1 }, TODAY],
  ])('TC-DISP-034 범위 밖 %j는 가장 가까운 범위 끝 %s로 맞춘다', (picked, expected) => {
    expect(normalizePickedDate(picked, TODAY)).toBe(expected);
  });

  it('TC-DISP-034 범위 안의 값은 그대로다', () => {
    expect(normalizePickedDate({ year: 2026, month: 9, day: 17 }, TODAY)).toBe('2026-09-17');
    expect(normalizePickedDate({ year: 2026, month: 10, day: 27 }, TODAY)).toBe(TODAY);
    expect(normalizePickedDate({ year: 2026, month: 10, day: 5 }, TODAY)).toBe('2026-10-05');
  });

  it('TC-DISP-037 그 달에 없는 날은 말일로 맞춘다(31일 → 30일뿐인 달, 2027-02-29 → 02-28)', () => {
    const today = '2028-03-05';
    expect(normalizePickedDate({ year: 2026, month: 11, day: 31 }, today)).toBe('2026-11-30');
    expect(normalizePickedDate({ year: 2026, month: 9, day: 31 }, today)).toBe('2026-09-30');
    expect(normalizePickedDate({ year: 2027, month: 2, day: 29 }, today)).toBe('2027-02-28');
    expect(normalizePickedDate({ year: 2027, month: 2, day: 30 }, today)).toBe('2027-02-28');
  });

  it('TC-DISP-037 윤년 2028-02-29는 허용한다(가짜 시계 2028-03-05)', () => {
    expect(normalizePickedDate({ year: 2028, month: 2, day: 29 }, '2028-03-05')).toBe('2028-02-29');
  });
});

describe('센티넬 위치와 진입 URL (REQ-DISP-025, REQ-DISP-001)', () => {
  it.each([
    [20, 17],
    [27, 24],
    [4, 1],
    [3, 0],
    [2, 0],
    [1, 0],
    [0, 0],
  ])('TC-DISP-022 항목 %i개면 센티넬은 인덱스 %i(마지막에서 세 번째)다', (count, index) => {
    expect(displaySentinelIndex(count)).toBe(index);
  });

  it('REQ-DISP-001 홈 더보기의 `?date=…&sort=popular`를 읽는다', () => {
    expect(parseDisplayRoute('?date=2026-10-26&sort=popular')).toEqual({ date: '2026-10-26', sort: 'popular' });
    expect(parseDisplayRoute(new URLSearchParams({ date: '2026-10-27', sort: 'random' }))).toEqual({ date: '2026-10-27', sort: 'random' });
  });

  it('쿼리가 없거나 값이 틀리면 null이다(정렬은 소문자 recent|popular|random만, 날짜는 존재하는 yyyy-MM-dd만)', () => {
    expect(parseDisplayRoute('')).toEqual({ date: null, sort: null });
    expect(parseDisplayRoute('?sort=Recent&date=2026-13-40')).toEqual({ date: null, sort: null });
    expect(parseDisplayRoute('?date=2026-02-30&sort=best')).toEqual({ date: null, sort: null });
    expect(parseDisplayRoute('?date=20261026')).toEqual({ date: null, sort: null });
    expect(parseDisplayRoute('?sort=recent')).toEqual({ date: null, sort: 'recent' });
  });
});
