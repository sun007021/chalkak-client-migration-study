import { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';
import { RECORD_COPY } from './recordCopy';

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
  const first = KstDate.of(month.year, month.month, 1);
  const lastDay = KstDate.of(month.year, month.month, month.daysInMonth());
  const leadingBlanks = first.dayOfWeek();
  const rows = Math.ceil((leadingBlanks + lastDay.day) / 7);
  const cells = Array.from({ length: rows * 7 }, (_, index) => {
    const day = index - leadingBlanks + 1;
    return day >= 1 && day <= lastDay.day ? KstDate.of(month.year, month.month, day) : null;
  });
  return { rows, leadingBlanks, cells, lastDay };
}

/** 연월 라벨: `2026년 10월`. 문구 키가 shared/copy/ko.json에 없어 형식을 recordCopy.ts에 둔다. */
export function formatRecordMonthLabel(month: YearMonth): string {
  return RECORD_COPY.monthLabel(month);
}
