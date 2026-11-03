import type { Clock } from '../../core/time/Clock';
import type { DateString } from '../../core/time/kst';
import type { YearMonth } from './recordModels';

const NOT_IMPLEMENTED = 'not implemented';

/** 달력 격자: offset은 1일 앞의 빈 칸 수(일요일 시작), days는 말일, rows는 행 수, cells는 rows*7개(빈 칸은 null, 이전·다음 달 날짜로 채우지 않는다). */
export interface MonthGrid {
  offset: number;
  days: number;
  rows: number;
  cells: (number | null)[];
}

/** 'yyyy-MM'(월은 두 자리). */
export function monthKey(_ym: YearMonth): string {
  throw new Error(NOT_IMPLEMENTED);
}

/** 'yyyy-MM' → YearMonth. 형식이 틀리면 null. */
export function parseMonthKey(_key: string): YearMonth | null {
  throw new Error(NOT_IMPLEMENTED);
}

/** KST 기준 현재 달(D-19). 기기 시간대와 무관하다. */
export function currentYearMonth(_clock: Clock): YearMonth {
  throw new Error(NOT_IMPLEMENTED);
}

/** 서버 연월 목록과 현재 달의 합집합. 최신순·중복 없음(REQ-REC-002). 서버 목록이 비어도 현재 달은 들어간다. */
export function mergeAvailableMonths(_server: readonly YearMonth[], _current: YearMonth): YearMonth[] {
  throw new Error(NOT_IMPLEMENTED);
}

/** 일요일 시작 격자(REQ-REC-009, 010). 시간대와 무관한 순수 계산이다. */
export function monthGrid(_ym: YearMonth): MonthGrid {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * 연도를 바꿀 때 고를 달(TC-REC-018): 연도는 선택지의 첫 해~마지막 해로 맞추고, 그 해에 기록이 있는 달 중 target.month에 가장 가까운 달.
 * 같은 거리면 더 늦은 달.
 */
export function nearestAvailableMonth(_available: readonly YearMonth[], _target: YearMonth): YearMonth {
  throw new Error(NOT_IMPLEMENTED);
}

/** 월 라벨 "2026년 10월"(display.picker.year·display.picker.month). */
export function monthLabel(_ym: YearMonth): string {
  throw new Error(NOT_IMPLEMENTED);
}

/** 저장 파일 이름 `chalkak-calendar-{yyyy-MM}.png`(REQ-REC-037). */
export function calendarFileName(_ym: YearMonth): string {
  throw new Error(NOT_IMPLEMENTED);
}

/** 날짜 문자열이 속한 달. 형식이 틀리면 null. */
export function monthOfDate(_date: DateString): YearMonth | null {
  throw new Error(NOT_IMPLEMENTED);
}

/** location.search(`?date=…`) → 기록 진입 값. 날짜 형식·달력상 존재하지 않는 날짜면 date=null. */
export function parseRecordRoute(_search: string | URLSearchParams): { date: DateString | null } {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * 선택한 날짜 → URL 쓰기 계획. 이미 같은 date를 가리키면 null. 아니면 다른 파라미터를 유지하고 date만 덮어쓴 새 search를 돌려준다.
 * 선택이 없으면(null) date 파라미터를 지운 search(없으면 '')이고, 이미 없으면 null.
 */
export function planRecordUrlWrite(_search: string, _selectedDate: DateString | null): string | null {
  throw new Error(NOT_IMPLEMENTED);
}
