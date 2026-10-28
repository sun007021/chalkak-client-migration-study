import type { KstDate } from './KstDate';
import { toKstWallClock } from './kst';
import type { YearMonth } from './YearMonth';

// 화면 표시용 날짜·시각 문자열(REQ-TIME-009). 시스템 로캘을 쓰지 않고 한국어 형식을 직접 조립한다.

/** 요일 머리글. 일요일부터 토요일(REQ-TIME-005). */
export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** 알림 시각: `M월 d일 HH:mm` (KST, 24시간제, 연도 없음, 월·일 0 패딩 없음, 시·분은 2자리) */
export function formatNotificationTime(instant: Date): string {
  const { date, hour, minute } = toKstWallClock(instant);
  return `${date.month}월 ${date.day}일 ${pad2(hour)}:${pad2(minute)}`;
}

/** `M월 d일` */
export function formatMonthDay(date: KstDate): string {
  return `${date.month}월 ${date.day}일`;
}

/** `M월 d일의 주제` */
export function formatTopicDateLabel(date: KstDate): string {
  return `${date.month}월 ${date.day}일의 주제`;
}

/** `M월 d일 · 오늘의 주제` */
export function formatTodayTopicLabel(date: KstDate): string {
  return `${date.month}월 ${date.day}일 · 오늘의 주제`;
}

/** `chalkak-calendar-yyyy-MM.png` (REQ-REC-037) */
export function calendarImageFileName(ym: YearMonth): string {
  return `chalkak-calendar-${ym.toString()}.png`;
}
