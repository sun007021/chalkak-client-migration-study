import { FIRST_TOPIC_DATE } from '../../shared/constants';
import type { Clock } from './Clock';
import { KstDate } from './KstDate';

// KST(Asia/Seoul) 날짜·시각 유틸. 순수 함수이며 시스템 시계·기기 시간대·로캘을 쓰지 않는다.
// 시간대 계산은 UTC+9 산술과 Date#getUTC* 만 사용한다(toLocale*·Intl 금지).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** 요일 머리글. 일요일부터 토요일(REQ-TIME-005). */
export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** 순간을 UTC+9로 옮긴 Date. 이 Date의 getUTC* 값이 곧 KST 벽시계 값이다. */
const shiftToKst = (instant: Date): Date => new Date(instant.getTime() + KST_OFFSET_MS);

/** 같은 순간의 KST 달력 날짜. */
export function toKstDate(instant: Date): KstDate {
  const kst = shiftToKst(instant);
  return KstDate.of(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate());
}

export function todayKst(clock: Clock): KstDate {
  return toKstDate(clock.now());
}

export function currentMonthKst(clock: Clock): YearMonth {
  return yearMonthOf(todayKst(clock));
}

export function yearMonthOf(date: KstDate): YearMonth {
  return { year: date.year, month: date.month };
}

/** `yyyy-MM` */
export function formatYearMonth(ym: YearMonth): string {
  return `${String(ym.year).padStart(4, '0')}-${pad2(ym.month)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// 소수초는 선택, 오프셋(Z 또는 ±hh:mm)은 필수. 오프셋 없는 문자열은 시간대를 알 수 없어 거부한다.
const INSTANT_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(?:Z|([+-])([0-9]{2}):([0-9]{2}))$/;

/** 소수 초 유무·자릿수와 `Z`/`±hh:mm` 오프셋을 받는다(밀리초 아래는 버림). 파싱 불가면 null. */
export function parseInstant(text: string): Date | null {
  const match = INSTANT_PATTERN.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const millis = match[7] ? Number(match[7].slice(0, 3).padEnd(3, '0')) : 0;
  const offsetHour = match[9] ? Number(match[9]) : 0;
  const offsetMinute = match[10] ? Number(match[10]) : 0;
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  if (KstDate.parse(text.slice(0, 10)) === null) return null;

  const sign = match[8] === '-' ? -1 : 1;
  const offsetMs = sign * (offsetHour * 60 + offsetMinute) * 60_000;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMs);
}

/** 날짜가 속한 주의 7일(일요일 시작). */
export function weekOf(date: KstDate): KstDate[] {
  const sunday = date.plusDays(-date.dayOfWeek());
  return Array.from({ length: 7 }, (_, index) => sunday.plusDays(index));
}

/** 날짜들이 걸친 연월(중복 없음, 오름차순). */
export function monthsSpanned(dates: readonly KstDate[]): YearMonth[] {
  const byKey = new Map<string, YearMonth>();
  for (const date of dates) byKey.set(formatYearMonth(yearMonthOf(date)), yearMonthOf(date));
  return [...byKey.values()].sort(compareYearMonth);
}

/** 같은 일(day)을 유지하며 지정한 연월로 옮기고, 그 달에 없는 일이면 말일로 보정한다. */
export function moveToMonth(date: KstDate, target: YearMonth): KstDate {
  const day = Math.min(date.day, daysInMonth(target.year, target.month));
  return KstDate.of(target.year, target.month, day);
}

const firstTopicDate = (): KstDate => {
  const parsed = KstDate.parse(FIRST_TOPIC_DATE);
  if (!parsed) throw new Error(`invalid FIRST_TOPIC_DATE: ${FIRST_TOPIC_DATE}`);
  return parsed;
};

export function isBeforeFirstTopicDate(date: KstDate): boolean {
  return date.compare(firstTopicDate()) < 0;
}

/** FIRST_TOPIC_DATE보다 이르면 FIRST_TOPIC_DATE, 아니면 그대로. */
export function clampToFirstTopicDate(date: KstDate): KstDate {
  return isBeforeFirstTopicDate(date) ? firstTopicDate() : date;
}

/** 주어진 KST 날짜가 시계 기준 KST 오늘인가(제목 수정 버튼 판정 등). */
export function isToday(date: KstDate, clock: Clock): boolean {
  return date.equals(todayKst(clock));
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year - b.year || a.month - b.month;
}

/** 서버 월 목록(최신순)에 현재 달이 없으면 넣는다. 중복 없이 최신순을 유지한다(D-19). */
export function withCurrentMonth(months: readonly YearMonth[], current: YearMonth): YearMonth[] {
  const hasCurrent = months.some((ym) => compareYearMonth(ym, current) === 0);
  const all = hasCurrent ? [...months] : [...months, current];
  return all.sort((a, b) => compareYearMonth(b, a));
}

/** 알림 시각: `M월 d일 HH:mm` (KST, 24시간제, 연도 없음, 월·일 0 패딩 없음, 시·분은 2자리) */
export function formatNotificationTime(instant: Date): string {
  const kst = shiftToKst(instant);
  const time = `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${time}`;
}

/** `M월 d일의 주제` */
export function formatTopicDateLabel(date: KstDate): string {
  return `${date.month}월 ${date.day}일의 주제`;
}

/** `M월 d일 · 오늘의 주제` */
export function formatTodayTopicLabel(date: KstDate): string {
  return `${date.month}월 ${date.day}일 · 오늘의 주제`;
}

/** `chalkak-calendar-yyyy-MM.png` */
export function calendarImageFileName(ym: YearMonth): string {
  return `chalkak-calendar-${formatYearMonth(ym)}.png`;
}
