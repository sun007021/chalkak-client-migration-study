import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/core/time/record_months.dart';
import 'package:chalkak/features/record/domain/record_month_picker.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fixtures.dart';

List<KstMonth> _months(String fixture) => [
  for (final m
      in (Fixture.load(fixture) as Map<String, Object?>)['months']! as List)
    KstMonth((m as Map<String, Object?>)['year']! as int, m['month']! as int),
];

void main() {
  const current = KstMonth(2026, 10);

  test('TC-REC-002 서버 목록 [2026-10, 2026-09]는 최신순·중복 없이 선택지가 된다', () {
    final server = _months('record/posts-calendar-months__recent-first.json');
    final options = RecordMonths.options(
      serverMonths: [...server, const KstMonth(2026, 9)],
      current: current,
    );
    expect(options, [const KstMonth(2026, 10), const KstMonth(2026, 9)]);
  });

  test('TC-REC-002 월 목록이 비어 있어도 오류 없이 현재 달만 선택지에 있다', () {
    final server = _months('record/posts-calendar-months__empty.json');
    expect(server, isEmpty);
    expect(RecordMonths.options(serverMonths: server, current: current), [
      current,
    ]);
  });

  test('TC-REC-003 월 목록에 현재 달이 없어도 현재 달이 선택지에 포함된다', () {
    final server = _months(
      'record/posts-calendar-months__without-current.json',
    );
    expect(server, [const KstMonth(2026, 9)]);
    expect(RecordMonths.options(serverMonths: server, current: current), [
      const KstMonth(2026, 10),
      const KstMonth(2026, 9),
    ]);
  });

  group('TC-REC-018 연도 변경', () {
    final multi = _months('record/posts-calendar-months__multi-year.json');

    test('선택지의 연도는 오름차순·중복 없이 나온다', () {
      expect(RecordMonthPicker.years(multi), [2025, 2026]);
    });

    test('2026-10에서 2025로 바꾸면 그 해 선택지 중 가장 가까운 12월이 선택된다', () {
      expect(
        RecordMonthPicker.monthAfterYearChange(
          options: multi,
          from: const KstMonth(2026, 10),
          year: 2025,
        ),
        const KstMonth(2025, 12),
      );
    });

    test('2025-03에서 2026으로 바꾸면 3월에 가장 가까운 2026-09가 선택된다', () {
      expect(
        RecordMonthPicker.monthAfterYearChange(
          options: multi,
          from: const KstMonth(2025, 3),
          year: 2026,
        ),
        const KstMonth(2026, 9),
      );
    });

    test('첫 해 이전·마지막 해 이후로는 바뀌지 않는다', () {
      for (final year in [2024, 2027]) {
        expect(
          RecordMonthPicker.monthAfterYearChange(
            options: multi,
            from: const KstMonth(2026, 10),
            year: year,
          ),
          isNull,
          reason: '$year',
        );
      }
    });
  });
}
