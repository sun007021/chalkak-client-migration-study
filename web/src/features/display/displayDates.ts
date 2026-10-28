import { FIRST_TOPIC_DATE } from '../../constants';
import { clampDayToMonth, formatDateString, kstDateOf, kstStartOfDay, parseDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
export type DisplaySort = 'recent' | 'popular' | 'random';
export const DISPLAY_SORTS: readonly DisplaySort[] = ['recent', 'popular', 'random'];
export interface PickedDate { year: number; month: number; day: number }
export interface PickerOptions { years: number[]; months: number[]; days: number[] }
export function clampDisplayDate(date: DateString, today: DateString): DateString { return date < FIRST_TOPIC_DATE ? FIRST_TOPIC_DATE : date > today ? today : date; }
export function shiftDate(date: DateString, days: number): DateString { return kstDateOf(kstStartOfDay(date) + days * 86_400_000 + 3_600_000); }
export function isArchiveDate(date: DateString, today: DateString): boolean { return date < today; }
export function toPickedDate(date: DateString): PickedDate | null { try { return parseDateString(date); } catch { return null; } }
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function pickerOptions(sel: Pick<PickedDate, 'year' | 'month'>, today: DateString): PickerOptions {
  const f = parseDateString(FIRST_TOPIC_DATE), t = parseDateString(today);
  const years = Array.from({ length: t.year - f.year + 1 }, (_, i) => f.year + i);
  const m0 = sel.year === f.year ? f.month : 1, m1 = sel.year === t.year ? t.month : 12;
  const months = Array.from({ length: m1 - m0 + 1 }, (_, i) => m0 + i);
  const d0 = sel.year === f.year && sel.month === f.month ? f.day : 1;
  const d1 = sel.year === t.year && sel.month === t.month ? t.day : dim(sel.year, sel.month);
  return { years, months, days: Array.from({ length: d1 - d0 + 1 }, (_, i) => d0 + i) };
}
export function normalizePickedDate(p: PickedDate, today: DateString): DateString { return clampDisplayDate(clampDayToMonth(p.year, p.month, p.day), today) || formatDateString(p.year, p.month, p.day); }
export function displaySentinelIndex(count: number): number { return Math.max(0, count - 3); }
export function parseDisplayRoute(search: string | URLSearchParams): { date: DateString | null; sort: DisplaySort | null } {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search;
  const date = q.get('date'); const sort = q.get('sort');
  return { date: date && toPickedDate(date) ? date : null, sort: (DISPLAY_SORTS as readonly string[]).includes(sort ?? '') ? (sort as DisplaySort) : null };
}
