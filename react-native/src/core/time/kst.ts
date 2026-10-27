import type { Clock } from './Clock';
import { KstDate } from './KstDate';
import { utcDate } from './utcDate';
import { YearMonth } from './YearMonth';

// KST(Asia/Seoul) 날짜·시각 계산. 순수 함수이며 시스템 시계·기기 시간대·로캘을 쓰지 않는다.
// 시간대 계산은 UTC+9 산술과 Date#getUTC* 만 사용한다(toLocale*·Intl 금지).

/**
 * 서비스 시간대(`SERVICE_TIME_ZONE` = Asia/Seoul)의 UTC 오프셋.
 * 한국은 서머타임이 없어 고정 +9시간이므로 오프셋 상수 하나로 충분하다.
 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 순간을 KST 벽시계로 분해한 값. */
export interface KstWallClock {
  readonly date: KstDate;
  readonly hour: number;
  readonly minute: number;
}

/** 순간을 UTC+9로 옮긴 뒤 getUTC*로 읽는다. 유효하지 않은 Date(NaN)는 RangeError. */
export function toKstWallClock(instant: Date): KstWallClock {
  const shifted = new Date(instant.getTime() + KST_OFFSET_MS);
  return {
    date: KstDate.of(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 같은 순간의 KST 달력 날짜. */
export function toKstDate(instant: Date): KstDate {
  return toKstWallClock(instant).date;
}

export function todayKst(clock: Clock): KstDate {
  return toKstDate(clock.now());
}

export function currentMonthKst(clock: Clock): YearMonth {
  return YearMonth.from(todayKst(clock));
}

// 소수초는 선택, 오프셋(Z 또는 ±hh:mm)은 필수. 오프셋 없는 문자열은 시간대를 알 수 없어 거부한다.
// 소문자 z, 공백 구분자, `+0000`(콜론 없음)은 ISO-8601 서버 형식이 아니므로 거부한다.
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
  const wall = utcDate(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, millis);
  return new Date(wall.getTime() - offsetMs);
}

/** 날짜가 속한 주의 7일(일요일 시작). */
export function weekOf(date: KstDate): KstDate[] {
  const sunday = date.plusDays(-date.dayOfWeek());
  return Array.from({ length: 7 }, (_, index) => sunday.plusDays(index));
}

/** 날짜들이 걸친 연월(중복 없음, 오름차순). */
export function monthsSpanned(dates: readonly KstDate[]): YearMonth[] {
  const byKey = new Map<string, YearMonth>();
  for (const date of dates) {
    const ym = YearMonth.from(date);
    byKey.set(ym.toString(), ym);
  }
  return [...byKey.values()].sort((a, b) => a.compare(b));
}

/** 같은 일(day)을 유지하며 지정한 연월로 옮기고, 그 달에 없는 일이면 말일로 보정한다. */
export function moveToMonth(date: KstDate, target: YearMonth): KstDate {
  return KstDate.of(target.year, target.month, Math.min(date.day, target.daysInMonth()));
}

/** 주어진 KST 날짜가 시계 기준 KST 오늘인가(제목 수정 버튼 판정 등). */
export function isToday(date: KstDate, clock: Clock): boolean {
  return date.equals(todayKst(clock));
}

/** 서버 월 목록(최신순)에 현재 달이 없으면 넣는다. 중복 없이 최신순을 유지한다(D-19). */
export function withCurrentMonth(months: readonly YearMonth[], current: YearMonth): YearMonth[] {
  const all = months.some((ym) => ym.equals(current)) ? [...months] : [...months, current];
  return all.sort((a, b) => b.compare(a));
}
