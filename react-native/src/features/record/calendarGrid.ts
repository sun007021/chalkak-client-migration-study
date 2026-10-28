import type { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';

export type CalendarGrid = {
  /** 7열 격자의 행 수. */
  rows: number;
  /** 1일 앞의 빈 칸 수(일요일 시작: 일=0 … 토=6). */
  leadingBlanks: number;
  /** 길이 rows*7. 앞뒤 빈 칸은 null(이전·다음 달 날짜로 채우지 않는다, REQ-REC-010). */
  cells: readonly (KstDate | null)[];
  lastDay: KstDate;
};

export function buildCalendarGrid(month: YearMonth): CalendarGrid {
  void month;
  throw new Error('not implemented');
}

/** 연월 라벨: `2026년 10월` ([가정] 문구 키가 없어 형식을 코드에 둔다). */
export function formatRecordMonthLabel(month: YearMonth): string {
  void month;
  throw new Error('not implemented');
}
