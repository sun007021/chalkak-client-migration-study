import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_calendar_grid.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-REC-010 월별 행 수·첫 날 오프셋·마지막 날이 정확하다(윤년 포함)', () {
    // (월, 행 수, 첫 날 오프셋(일=0), 일 수)
    final cases = <(KstMonth, int, int, int)>[
      (const KstMonth(2026, 2), 4, 0, 28),
      (const KstMonth(2026, 10), 5, 4, 31),
      (const KstMonth(2026, 5), 6, 5, 31),
      (const KstMonth(2026, 11), 5, 0, 30),
      (const KstMonth(2027, 1), 6, 5, 31),
      (const KstMonth(2028, 2), 5, 2, 29),
    ];
    for (final (month, rows, offset, days) in cases) {
      final grid = RecordCalendarGrid(month);
      expect(grid.rowCount, rows, reason: '$month 행 수');
      expect(grid.leadingBlanks, offset, reason: '$month 첫 날 오프셋');
      final cells = grid.cells;
      expect(cells, hasLength(rows * 7), reason: '$month 칸 수');
      expect(cells.take(offset), everyElement(isNull));
      expect(cells[offset], KstDate(month.year, month.month, 1));
      expect(
        cells[offset + days - 1],
        KstDate(month.year, month.month, days),
        reason: '$month 마지막 날',
      );
      // 마지막 날 뒤의 남는 칸은 비어 있고, 이전·다음 달 날짜로 채우지 않는다.
      expect(cells.skip(offset + days), everyElement(isNull));
      expect(cells.whereType<KstDate>(), hasLength(days));
    }
  });
}
