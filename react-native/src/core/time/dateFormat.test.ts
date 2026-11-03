import { d, withHostileLocale } from './__testing__/helpers';
import {
  WEEKDAY_HEADERS,
  calendarImageFileName,
  formatNotificationTime,
  formatTodayTopicLabel,
  formatTopicDateLabel,
} from './dateFormat';
import { KstDate } from './KstDate';
import { YearMonth } from './YearMonth';

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

  // `npm run test:tz`가 이 파일을 UTC·America/Los_Angeles·Asia/Seoul 등 시간대마다 다시 실행한다.
  // 어느 기기 시간대에서도 같은 createdAt은 같은 KST 문자열이어야 한다(D-09).
  it('TC-NOTI-013 같은 createdAt은 기기 시간대(UTC·America/Los_Angeles·Asia/Seoul)와 무관하게 같은 문자열이다', () => {
    const expected = new Map([
      ['2026-10-26T14:59:59Z', '10월 26일 23:59'],
      ['2026-10-26T15:00:00Z', '10월 27일 00:00'],
      ['2026-11-01T09:00:00Z', '11월 1일 18:00'], // America/Los_Angeles 서머타임 종료 순간
    ]);
    expected.forEach((label, iso) => {
      expect(formatNotificationTime(new Date(iso))).toBe(label);
    });
    // 기기 로컬 시각 API(getHours 등)는 쓰지 않는다: 시간대가 다른 기기를 흉내 내 모두 엉뚱한 값을 줘도 같다.
    const local = ['getHours', 'getMinutes', 'getDate', 'getMonth', 'getFullYear'] as const;
    const spies = local.map((m) => jest.spyOn(Date.prototype, m).mockReturnValue(7));
    try {
      expected.forEach((label, iso) => {
        expect(formatNotificationTime(new Date(iso))).toBe(label);
      });
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('TC-NOTI-014 TC-TIME-024 12시간제·아랍어·태국어 기기 설정과 무관하게 24시간제 ASCII 숫자다', () => {
    withHostileLocale(() => {
      const label = formatNotificationTime(new Date('2026-10-20T11:30:00Z'));
      expect(label).toBe('10월 20일 20:30');
      expect(label).toMatch(/^[0-9가-힣 :]+$/);
      expect(label).not.toMatch(/AM|PM|오전|오후/);
    });
  });

  it('TC-TIME-024 시스템 로캘(아랍어·태국어·페르시아어)과 무관하게 같은 문자열', () => {
    withHostileLocale(() => {
      expect(formatNotificationTime(new Date('2026-10-20T05:00:00Z'))).toBe('10월 20일 14:00');
      expect(formatTopicDateLabel(KstDate.of(2026, 1, 5))).toBe('1월 5일의 주제');
    });
  });

  it('REQ-REC-037 달력 이미지 파일명과 연월 표기', () => {
    expect(calendarImageFileName(YearMonth.of(2026, 10))).toBe('chalkak-calendar-2026-10.png');
    expect(calendarImageFileName(YearMonth.of(2026, 1))).toBe('chalkak-calendar-2026-01.png');
    expect(YearMonth.of(2027, 3).toString()).toBe('2027-03');
  });
});

describe('TIME: 요일 머리글', () => {
  it('REQ-TIME-005 요일 머리글은 일월화수목금토 순서', () => {
    expect([...WEEKDAY_HEADERS]).toEqual(['일', '월', '화', '수', '목', '금', '토']);
  });
});
