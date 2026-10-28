import { KstDate } from '../../core/time/KstDate';

/** 전시 날짜 이동·선택 범위: [최초 전시일(D-12), KST 오늘]. */
export type DateRange = { min: KstDate; max: KstDate };

/** 휠에 나오는 연도(오름차순). */
export function availableYears(range: DateRange): number[] {
  const years: number[] = [];
  for (let y = range.min.year; y <= range.max.year; y++) years.push(y);
  return years;
}

/** 해당 연도에서 고를 수 있는 월(1~12). 첫 해는 min 월 이후, 마지막 해는 max 월까지. */
export function availableMonths(range: DateRange, year: number): number[] {
  const from = year === range.min.year ? range.min.month : 1;
  const to = year === range.max.year ? range.max.month : 12;
  const months: number[] = [];
  for (let m = from; m <= to; m++) months.push(m);
  return months;
}

function lastDay(year: number, month: number): number {
  let day = 31;
  while (day > 28 && KstDate.parse(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`) === null)
    day--;
  return day;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** 해당 연월에서 고를 수 있는 일. 첫 달은 min 일부터, 마지막 달은 max 일까지, 사이 달은 말일까지. */
export function availableDays(range: DateRange, year: number, month: number): number[] {
  const from = year === range.min.year && month === range.min.month ? range.min.day : 1;
  const to =
    year === range.max.year && month === range.max.month ? range.max.day : lastDay(year, month);
  const days: number[] = [];
  for (let d = from; d <= to; d++) days.push(d);
  return days;
}

/** 범위 밖이면 가장 가까운 끝으로 맞춘다. */
export function clampToRange(date: KstDate, range: DateRange): KstDate {
  if (date.compare(range.min) < 0) return range.min;
  if (date.compare(range.max) > 0) return range.max;
  return date;
}

/** 휠에서 고른 연·월·일을 날짜로. 그 달에 없는 일(2월 30일)은 말일로, 범위 밖이면 끝으로 맞춘다. */
export function resolvePickedDate(
  range: DateRange,
  year: number,
  month: number,
  day: number,
): KstDate {
  const picked = KstDate.of(year, month, Math.min(day, lastDay(year, month)));
  return clampToRange(picked, range);
}

/** 헤더 접힘 진행도: 스크롤 오프셋 / 접힘 거리를 0~1로 clamp(위로 스크롤하면 줄어든다). */
export function collapseProgress(scrollOffset: number, collapseDistance: number): number {
  if (collapseDistance <= 0) return 1;
  return Math.min(1, Math.max(0, scrollOffset / collapseDistance));
}
