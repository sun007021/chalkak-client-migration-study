import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/date_picker_rules.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

List<int> _range(int from, int to) => [for (var i = from; i <= to; i++) i];

void main() {
  group('휠 범위', () {
    test('TC-DISP-036 오늘 2026-10-27: 연은 2026뿐, 월은 9~10월', () {
      expect(DatePickerRules.years(today: today), [2026]);
      expect(DatePickerRules.months(year: 2026, today: today), [9, 10]);
    });

    test('TC-DISP-036 첫 달은 17일부터, 마지막 달은 오늘(27일)까지', () {
      expect(
        DatePickerRules.days(year: 2026, month: 9, today: today),
        _range(17, 30),
      );
      expect(
        DatePickerRules.days(year: 2026, month: 10, today: today),
        _range(1, 27),
      );
    });

    test('TC-DISP-036 여러 해에 걸치면 첫 해는 9월부터, 마지막 해는 오늘의 월까지, 사이 달은 말일까지', () {
      final t = day('2027-02-10');
      expect(DatePickerRules.years(today: t), [2026, 2027]);
      expect(DatePickerRules.months(year: 2026, today: t), [9, 10, 11, 12]);
      expect(DatePickerRules.months(year: 2027, today: t), [1, 2]);
      expect(
        DatePickerRules.days(year: 2026, month: 10, today: t),
        _range(1, 31),
      );
      expect(
        DatePickerRules.days(year: 2026, month: 11, today: t),
        _range(1, 30),
      );
      expect(
        DatePickerRules.days(year: 2027, month: 1, today: t),
        _range(1, 31),
      );
      expect(
        DatePickerRules.days(year: 2027, month: 2, today: t),
        _range(1, 10),
      );
    });

    test('TC-DISP-036 오늘이 최초 전시일이면 선택지는 하나뿐이다', () {
      final t = KstDate.firstTopic;
      expect(DatePickerRules.years(today: t), [2026]);
      expect(DatePickerRules.months(year: 2026, today: t), [9]);
      expect(DatePickerRules.days(year: 2026, month: 9, today: t), [17]);
    });

    test('TC-DISP-036 휠 값의 모든 조합이 [최초 전시일, 오늘] 안에 있다', () {
      for (final t in [
        today,
        day('2027-03-05'),
        day('2028-03-05'),
        day('2026-12-31'),
      ]) {
        for (final y in DatePickerRules.years(today: t)) {
          for (final m in DatePickerRules.months(year: y, today: t)) {
            for (final d in DatePickerRules.days(year: y, month: m, today: t)) {
              final date = KstDate(y, m, d);
              expect(
                date >= KstDate.firstTopic && date <= t,
                isTrue,
                reason: '$date / $t',
              );
            }
          }
        }
      }
    });
  });

  group('날짜 보정', () {
    test('TC-DISP-037 30일뿐인 달에서 31일은 말일로 맞춘다', () {
      expect(
        DatePickerRules.adjust(year: 2026, month: 9, day: 31, today: today),
        day('2026-09-30'),
      );
    });

    test('TC-DISP-037 2027-02-29는 28일로, 윤년 2028-02-29는 그대로 허용한다', () {
      expect(
        DatePickerRules.adjust(
          year: 2027,
          month: 2,
          day: 29,
          today: day('2027-03-05'),
        ),
        day('2027-02-28'),
      );
      expect(
        DatePickerRules.adjust(
          year: 2028,
          month: 2,
          day: 29,
          today: day('2028-03-05'),
        ),
        day('2028-02-29'),
      );
    });

    test('TC-DISP-034 범위 밖은 가장 가까운 끝으로 맞춘다', () {
      expect(
        DatePickerRules.adjust(year: 2026, month: 9, day: 1, today: today),
        day('2026-09-17'),
      );
      expect(
        DatePickerRules.adjust(year: 2026, month: 8, day: 31, today: today),
        KstDate.firstTopic,
      );
      expect(
        DatePickerRules.adjust(year: 2026, month: 10, day: 28, today: today),
        today,
      );
      expect(
        DatePickerRules.adjust(year: 2026, month: 11, day: 5, today: today),
        today,
      );
      expect(
        DatePickerRules.adjust(year: 2027, month: 1, day: 1, today: today),
        today,
      );
    });

    test('범위 안의 날짜는 그대로다', () {
      expect(
        DatePickerRules.adjust(year: 2026, month: 10, day: 5, today: today),
        day('2026-10-05'),
      );
      expect(
        DatePickerRules.adjust(year: 2026, month: 9, day: 17, today: today),
        KstDate.firstTopic,
      );
      expect(
        DatePickerRules.adjust(year: 2026, month: 10, day: 27, today: today),
        today,
      );
    });
  });
}
