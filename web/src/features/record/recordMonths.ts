import { t } from '../../copy/ko';
import type { Clock } from '../../core/time/Clock';
import { kstToday, parseDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { YearMonth } from './recordModels';

/** 달력 격자: offset은 1일 앞의 빈 칸 수(일요일 시작), days는 말일, rows는 행 수, cells는 rows*7개(빈 칸은 null, 이전·다음 달 날짜로 채우지 않는다). */
export interface MonthGrid {
  offset: number;
  days: number;
  rows: number;
  cells: (number | null)[];
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');
const KEY_PATTERN = /^(\d{4})-(\d{2})$/;

/** 'yyyy-MM'(월은 두 자리). */
export function monthKey(ym: YearMonth): string {
  return `${pad(ym.year, 4)}-${pad(ym.month, 2)}`;
}

/** 'yyyy-MM' → YearMonth. 형식이 틀리면 null. */
export function parseMonthKey(key: string): YearMonth | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/** 오래된 순으로 비교한 값(같으면 0, 앞이 더 오래되면 음수). */
export const compareMonths = (a: YearMonth, b: YearMonth): number => a.year * 12 + a.month - (b.year * 12 + b.month);

export const sameMonth = (a: YearMonth, b: YearMonth): boolean => a.year === b.year && a.month === b.month;

/** KST 기준 현재 달(D-19). 기기 시간대와 무관하다. */
export function currentYearMonth(clock: Clock): YearMonth {
  const { year, month } = parseDateString(kstToday(clock));
  return { year, month };
}

/** 서버 연월 목록과 현재 달의 합집합. 최신순·중복 없음(REQ-REC-002). 서버 목록이 비어도 현재 달은 들어간다. */
export function mergeAvailableMonths(server: readonly YearMonth[], current: YearMonth): YearMonth[] {
  const byKey = new Map<string, YearMonth>();
  for (const ym of [...server, current]) byKey.set(monthKey(ym), { year: ym.year, month: ym.month });
  return [...byKey.values()].sort((a, b) => compareMonths(b, a));
}

/** 일요일 시작 격자(REQ-REC-009, 010). 시간대와 무관한 순수 계산이다. */
export function monthGrid(ym: YearMonth): MonthGrid {
  const offset = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const rows = Math.ceil((offset + days) / 7);
  const cells: (number | null)[] = Array.from({ length: rows * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= days ? day : null;
  });
  return { offset, days, rows, cells };
}

/**
 * 연도를 바꿀 때 고를 달(TC-REC-018): 연도는 선택지의 첫 해~마지막 해로 맞추고, 그 해에 기록이 있는 달 중 target.month에 가장 가까운 달.
 * 같은 거리면 더 늦은 달.
 */
export function nearestAvailableMonth(available: readonly YearMonth[], target: YearMonth): YearMonth {
  if (available.length === 0) return target;
  const years = available.map((ym) => ym.year);
  const year = Math.min(Math.max(target.year, Math.min(...years)), Math.max(...years));
  const sameYear = available.filter((ym) => ym.year === year);
  // 그 해에 선택지가 하나도 없으면(중간 해가 비어 있음) 연·월을 합친 거리로 전체에서 고른다.
  const candidates = sameYear.length > 0 ? sameYear : [...available];
  const distance = (ym: YearMonth): number => (sameYear.length > 0 ? Math.abs(ym.month - target.month) : Math.abs(compareMonths(ym, target)));
  let best = candidates[0]!;
  for (const ym of candidates) {
    const closer = distance(ym) < distance(best);
    const tieLater = distance(ym) === distance(best) && compareMonths(ym, best) > 0;
    if (closer || tieLater) best = ym;
  }
  return best;
}

/** 월 라벨 "2026년 10월"(display.picker.year·display.picker.month). */
export function monthLabel(ym: YearMonth): string {
  return `${t('display.picker.year', { n: ym.year })} ${t('display.picker.month', { n: ym.month })}`;
}

/** 저장 파일 이름 `chalkak-calendar-{yyyy-MM}.png`(REQ-REC-037). */
export function calendarFileName(ym: YearMonth): string {
  return `chalkak-calendar-${monthKey(ym)}.png`;
}

/** 날짜 문자열이 속한 달. 형식이 틀리면 null. */
export function monthOfDate(date: DateString): YearMonth | null {
  try {
    const { year, month } = parseDateString(date);
    return { year, month };
  } catch {
    return null;
  }
}

/** location.search(`?date=…`) → 기록 진입 값. 날짜 형식·달력상 존재하지 않는 날짜면 date=null. */
export function parseRecordRoute(search: string | URLSearchParams): { date: DateString | null } {
  const raw = new URLSearchParams(search).get('date');
  return { date: raw !== null && monthOfDate(raw) !== null ? raw : null };
}

/**
 * 선택한 날짜 → URL 쓰기 계획. 이미 같은 date를 가리키면 null. 아니면 다른 파라미터를 유지하고 date만 덮어쓴 새 search를 돌려준다.
 * 선택이 없으면(null) date 파라미터를 지운 search(없으면 '')이고, 이미 없으면 null.
 */
export function planRecordUrlWrite(search: string, selectedDate: DateString | null): string | null {
  const params = new URLSearchParams(search);
  if (selectedDate === null) {
    if (!params.has('date')) return null;
    params.delete('date');
    const rest = params.toString();
    return rest ? `?${rest}` : '';
  }
  if (params.get('date') === selectedDate) return null;
  params.set('date', selectedDate);
  return `?${params.toString()}`;
}

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

/**
 * 달력 격자의 방향키 이동(사진이 있는 날만 갈 수 있다). dates는 같은 달 사진 날짜(오름차순).
 * ←/→는 이웃한 사진 날, ↑/↓는 7일 위/아래 방향에서 가장 가까운 사진 날(없으면 제자리), Home/End는 처음/끝.
 */
export function nextPhotoDate(dates: readonly DateString[], current: DateString, key: GridKey): DateString {
  const index = dates.indexOf(current);
  if (index < 0 || dates.length === 0) return current;
  const day = (date: DateString): number => Number(date.slice(8, 10));
  switch (key) {
    case 'ArrowLeft':
      return dates[Math.max(0, index - 1)]!;
    case 'ArrowRight':
      return dates[Math.min(dates.length - 1, index + 1)]!;
    case 'Home':
      return dates[0]!;
    case 'End':
      return dates[dates.length - 1]!;
    case 'ArrowUp':
      return dates.filter((date) => day(date) <= day(current) - 7).at(-1) ?? current;
    case 'ArrowDown':
      return dates.find((date) => day(date) >= day(current) + 7) ?? current;
  }
}
