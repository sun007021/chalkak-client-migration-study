import { YearMonth } from '../../core/time/YearMonth';
import { buildCalendarGrid, formatRecordMonthLabel } from './calendarGrid';

describe('buildCalendarGrid', () => {
  it.each([
    [2026, 2, 4, 0, 28],
    [2026, 10, 5, 4, 31],
    [2026, 5, 6, 5, 31],
    [2026, 11, 5, 0, 30],
    [2027, 1, 6, 5, 31],
    [2028, 2, 5, 2, 29],
  ])(
    'TC-REC-010 %i-%i: 행 %i, 첫 날 오프셋 %i, 마지막 날 %i일',
    (year, month, rows, offset, lastDay) => {
      const grid = buildCalendarGrid(YearMonth.of(year, month));
      expect(grid.rows).toBe(rows);
      expect(grid.leadingBlanks).toBe(offset);
      expect(grid.lastDay.day).toBe(lastDay);
      expect(grid.lastDay.month).toBe(month);
      expect(grid.cells).toHaveLength(rows * 7);
      expect(grid.cells.slice(0, offset).every((c) => c === null)).toBe(true);
      expect(grid.cells[offset]?.day).toBe(1);
      // 이전·다음 달 날짜로 채우지 않는다: 날짜 칸은 정확히 일수만큼.
      expect(grid.cells.filter((c) => c !== null)).toHaveLength(lastDay);
      expect(grid.cells[offset + lastDay - 1]?.day).toBe(lastDay);
      expect(grid.cells.slice(offset + lastDay).every((c) => c === null)).toBe(true);
    },
  );

  it('TC-REC-009 일요일 시작 7열: 2026-10-01은 목요일 칸(인덱스 4)에 놓인다', () => {
    const grid = buildCalendarGrid(YearMonth.of(2026, 10));
    expect(grid.cells[4]?.toString()).toBe('2026-10-01');
    expect(grid.cells[4 + 26]?.toString()).toBe('2026-10-27');
  });
});

describe('formatRecordMonthLabel', () => {
  it('TC-REC-042 연월 라벨은 "yyyy년 M월"(월 0 채움 없음)이다 [가정]', () => {
    expect(formatRecordMonthLabel(YearMonth.of(2026, 10))).toBe('2026년 10월');
    expect(formatRecordMonthLabel(YearMonth.of(2026, 9))).toBe('2026년 9월');
  });
});
