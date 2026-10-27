/** D-09 날짜 포맷 목록. 모두 KST, 0 패딩 없음(알림 시각의 HH:mm만 24시간제 0 패딩), 시스템 로캘 영향 없음. */
import { kstDateOf, parseDateString } from './kst';
import type { DateString } from './kst';

const KST_OFFSET_MS = 9 * 3_600_000;

/** '2026-10-20' → '10월 20일의 주제' */
export function topicDateLabel(date: DateString): string {
  const { month, day } = parseDateString(date);
  return `${month}월 ${day}일의 주제`;
}

/** '2026-10-20' → '10월 20일 · 오늘의 주제' */
export function todayTopicLabel(date: DateString): string {
  const { month, day } = parseDateString(date);
  return `${month}월 ${day}일 · 오늘의 주제`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** epoch ms → '10월 20일 14:00' (연도 없음) */
export function notificationTimeLabel(epochMs: number): string {
  const { month, day } = parseDateString(kstDateOf(epochMs));
  const kst = new Date(epochMs + KST_OFFSET_MS);
  return `${month}월 ${day}일 ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
}

/** (2026, 10) → 'chalkak-calendar-2026-10.png' */
export function calendarImageFileName(year: number, month: number): string {
  return `chalkak-calendar-${year}-${pad2(month)}.png`;
}

export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;
