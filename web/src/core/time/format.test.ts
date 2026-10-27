import { calendarImageFileName, notificationTimeLabel, todayTopicLabel, topicDateLabel, WEEKDAY_HEADERS } from './format';
import { DEVICE_TIME_ZONES, withHostileLocale, withTimeZone } from '../../test/withTimeZone';

describe('날짜 포맷 (D-09)', () => {
  it('TC-TIME-023 "M월 d일의 주제"는 월·일을 0 패딩하지 않는다', () => {
    expect(topicDateLabel('2026-01-05')).toBe('1월 5일의 주제');
    expect(topicDateLabel('2026-12-31')).toBe('12월 31일의 주제');
    expect(topicDateLabel('2026-10-20')).toBe('10월 20일의 주제');
  });

  it('TC-TIME-023 "M월 d일 · 오늘의 주제"도 0 패딩이 없다', () => {
    expect(todayTopicLabel('2026-01-05')).toBe('1월 5일 · 오늘의 주제');
    expect(todayTopicLabel('2026-12-31')).toBe('12월 31일 · 오늘의 주제');
  });

  it('TC-TIME-024 알림 시각은 "M월 d일 HH:mm" KST 24시간제이고 연도가 없다', () => {
    expect(notificationTimeLabel(Date.parse('2026-10-20T05:00:00Z'))).toBe('10월 20일 14:00');
    expect(notificationTimeLabel(Date.parse('2026-10-20T15:05:00Z'))).toBe('10월 21일 00:05');
    expect(notificationTimeLabel(Date.parse('2026-01-05T03:07:00Z'))).toBe('1월 5일 12:07');
    expect(notificationTimeLabel(Date.parse('2026-01-05T02:59:00Z'))).toBe('1월 5일 11:59');
  });

  it.each(DEVICE_TIME_ZONES)('TC-TIME-024 TC-TIME-003 기기 시간대 %s에서도 같은 문자열이다', (tz) => {
    expect(withTimeZone(tz, () => notificationTimeLabel(Date.parse('2026-10-20T05:00:00Z')))).toBe('10월 20일 14:00');
  });

  it('TC-TIME-024 12시간제·시스템 로캘(아랍 숫자 등)의 영향을 받지 않는다', () => {
    expect(withHostileLocale(() => notificationTimeLabel(Date.parse('2026-10-20T05:00:00Z')))).toBe('10월 20일 14:00');
    expect(withHostileLocale(() => topicDateLabel('2026-10-20'))).toBe('10월 20일의 주제');
  });

  it('달력 이미지 파일명은 chalkak-calendar-yyyy-MM.png다', () => {
    expect(calendarImageFileName(2026, 10)).toBe('chalkak-calendar-2026-10.png');
    expect(calendarImageFileName(2026, 1)).toBe('chalkak-calendar-2026-01.png');
  });

  it('REQ-TIME-005 요일 머리글은 일월화수목금토 순서다', () => {
    expect([...WEEKDAY_HEADERS].join('')).toBe('일월화수목금토');
  });
});
