/** D-09 날짜 포맷 목록. 모두 KST, 0 패딩 없음(알림 시각의 HH:mm만 24시간제 0 패딩), 시스템 로캘 영향 없음. */
import type { DateString } from './kst';

/** '2026-10-20' → '10월 20일의 주제' */
export function topicDateLabel(_date: DateString): string {
  throw new Error('not implemented');
}

/** '2026-10-20' → '10월 20일 · 오늘의 주제' */
export function todayTopicLabel(_date: DateString): string {
  throw new Error('not implemented');
}

/** epoch ms → '10월 20일 14:00' (연도 없음) */
export function notificationTimeLabel(_epochMs: number): string {
  throw new Error('not implemented');
}

/** (2026, 10) → 'chalkak-calendar-2026-10.png' */
export function calendarImageFileName(_year: number, _month: number): string {
  throw new Error('not implemented');
}

export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;
