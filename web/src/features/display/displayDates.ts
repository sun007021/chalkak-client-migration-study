import { FIRST_TOPIC_DATE } from '../../constants';
import { clampDayToMonth, kstDateOf, kstStartOfDay, parseDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';

/** 전시 정렬. 서버 쿼리 값과 같다(소문자만 허용, API F2). */
export type DisplaySort = 'recent' | 'popular' | 'random';
export const DISPLAY_SORTS: readonly DisplaySort[] = ['recent', 'popular', 'random'];

/** 날짜 선택기(년/월/일)에서 고른 값. */
export interface PickedDate {
  year: number;
  month: number;
  day: number;
}

export interface PickerOptions {
  /** FIRST_TOPIC_DATE의 해 ~ 오늘의 해. */
  years: number[];
  /** 고른 해에서 선택 가능한 달(첫 해는 하한 달부터, 마지막 해는 오늘 달까지). */
  months: number[];
  /** 고른 해·달에서 선택 가능한 일(첫 달은 하한 일부터, 마지막 달은 오늘까지, 그 사이는 말일까지). */
  days: number[];
}

const DAY_MS = 24 * 3_600_000;

const daysOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const sequence = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** date를 [FIRST_TOPIC_DATE, today] 범위로 맞춘다(범위 밖이면 가장 가까운 끝). */
export function clampDisplayDate(date: DateString, today: DateString): DateString {
  if (date < FIRST_TOPIC_DATE) return FIRST_TOPIC_DATE;
  if (date > today) return today;
  return date;
}

/** days일 옮긴 날짜(음수 가능). 범위는 보지 않는다. 월·연 경계를 넘는다. */
export function shiftDate(date: DateString, days: number): DateString {
  return kstDateOf(kstStartOfDay(date) + days * DAY_MS);
}

/** 이 날짜가 지난 날짜(아카이브)인가: date < today. */
export function isArchiveDate(date: DateString, today: DateString): boolean {
  return date < today;
}

/** "yyyy-MM-dd"를 PickedDate로. 형식 오류면 null. */
export function toPickedDate(date: DateString): PickedDate | null {
  try {
    return parseDateString(date);
  } catch {
    return null;
  }
}

/** 선택기에 보일 값. selected의 해·달에 따라 months·days가 정해진다. */
export function pickerOptions(selected: Pick<PickedDate, 'year' | 'month'>, today: DateString): PickerOptions {
  const first = parseDateString(FIRST_TOPIC_DATE);
  const last = parseDateString(today);
  const years = sequence(first.year, last.year);
  const firstMonth = selected.year === first.year ? first.month : 1;
  const lastMonth = selected.year === last.year ? last.month : 12;
  const months = sequence(firstMonth, lastMonth);
  const firstDay = selected.year === first.year && selected.month === first.month ? first.day : 1;
  const lastDay = selected.year === last.year && selected.month === last.month ? last.day : daysOfMonth(selected.year, selected.month);
  return { years, months, days: sequence(firstDay, lastDay) };
}

/**
 * 선택기 값을 유효한 날짜로 맞춘다: 달이 그 해의 선택 가능한 달 밖이면 가장 가까운 달로, 일이 그 달에 없으면(2월 30일) 말일로,
 * 범위 밖이면 가장 가까운 범위 끝으로(REQ-DISP-009). 결과는 항상 [FIRST_TOPIC_DATE, today] 안이다.
 */
export function normalizePickedDate(picked: PickedDate, today: DateString): DateString {
  const month = Math.min(12, Math.max(1, picked.month));
  const day = Math.max(1, picked.day);
  return clampDisplayDate(clampDayToMonth(picked.year, month, day), today);
}

/** 다음 페이지를 읽게 하는 센티넬을 놓을 항목 인덱스: 마지막에서 세 번째(= count-3). 3개 이하면 0(REQ-DISP-025). */
export function displaySentinelIndex(count: number): number {
  return Math.max(0, count - 3);
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** location.search(`?date=…&sort=…`)를 전시 진입 값으로. 날짜 형식이 틀리면 date=null, 정렬이 recent|popular|random이 아니면 sort=null. */
export function parseDisplayRoute(search: string | URLSearchParams): { date: DateString | null; sort: DisplaySort | null } {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const rawDate = params.get('date');
  const rawSort = params.get('sort');
  const date = rawDate !== null && DATE_SHAPE.test(rawDate) && toPickedDate(rawDate) ? rawDate : null;
  const sort = (DISPLAY_SORTS as readonly string[]).includes(rawSort ?? '') ? (rawSort as DisplaySort) : null;
  return { date, sort };
}
