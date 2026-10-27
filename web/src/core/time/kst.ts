/** 모든 날짜는 기기 시간대와 무관하게 Asia/Seoul(UTC+9, 서머타임 없음). 날짜 문자열은 그레고리력 ASCII yyyy-MM-dd. */
import { FIRST_TOPIC_DATE } from '../../constants';
import type { Clock } from './Clock';

export type DateString = string; // yyyy-MM-dd

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** epoch ms → KST 날짜. */
export function kstDateOf(epochMs: number): DateString {
  const d = new Date(epochMs + KST_OFFSET_MS);
  return formatDateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function kstToday(clock: Clock): DateString {
  return kstDateOf(clock.nowMs());
}

/** 날짜 문자열 비교용. 형식 오류면 throw. */
export function parseDateString(s: string): { year: number; month: number; day: number } {
  const m = DATE_PATTERN.exec(s);
  if (!m) throw new Error(`invalid date string: ${s}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new Error(`invalid date string: ${s}`);
  return { year, month, day };
}

export function formatDateString(year: number, month: number, day: number): DateString {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** KST 해당 날짜 00:00:00의 epoch ms. */
export function kstStartOfDay(date: DateString): number {
  const { year, month, day } = parseDateString(date);
  return Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
}

/** 다음 KST 자정(now 이후 첫 00:00:00)의 epoch ms. now가 정확히 자정이면 그다음 자정. */
export function nextKstMidnight(epochMs: number): number {
  return kstStartOfDay(kstDateOf(epochMs)) + DAY_MS;
}

/** 일요일 시작 주(일~토)의 7개 날짜와 걸친 월('yyyy-MM', 중복 없이 오름차순). */
export function weekOf(date: DateString): { days: DateString[]; months: string[] } {
  const start = kstStartOfDay(date);
  const weekday = new Date(start + KST_OFFSET_MS).getUTCDay();
  const sunday = start - weekday * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => kstDateOf(sunday + i * DAY_MS));
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  return { days, months };
}

/** year-month에서 day를 말일로 보정(31일→30일 달, 2027-02-29→02-28, 2028-02-29 유효). */
export function clampDayToMonth(year: number, month: number, day: number): DateString {
  return formatDateString(year, month, Math.min(day, daysInMonth(year, month)));
}

/** 전시 날짜 이동 하한(FIRST_TOPIC_DATE)과 상한(오늘) 안인가. 양 끝 포함. */
export function isSelectableTopicDate(date: DateString, today: DateString): boolean {
  return date >= FIRST_TOPIC_DATE && date <= today;
}

/** 주제 날짜가 KST 오늘인가(제목 수정 버튼 판정). */
export function isTodayKst(date: DateString, clock: Clock): boolean {
  return date === kstToday(clock);
}
