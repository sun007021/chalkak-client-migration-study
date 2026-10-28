import 'package:chalkak/core/time/kst_clock.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';

KstMonth _at(DateTime utc) =>
    withClock(Clock.fixed(utc), () => const KstClock().currentMonth());

void main() {
  test('TC-REC-005 KST 월말 23:59:59는 10월이고 자정(15:00Z)에는 11월이다', () {
    expect(
      _at(DateTime.utc(2026, 10, 31, 14, 59, 59)),
      const KstMonth(2026, 10),
    );
    expect(_at(DateTime.utc(2026, 10, 31, 15)), const KstMonth(2026, 11));
  });

  test('TC-REC-005 기기 시간대와 무관하다(로컬 표기 DateTime도 같은 순간이면 같은 달)', () {
    // 같은 순간을 UTC/로컬로 만들어도 KST 달이 같다. 기기 시간대 전환은 Dart 테스트에서
    // 바꿀 수 없으므로 순간(instant) 기준 계산이 시간대를 쓰지 않음을 확인한다.
    final instant = DateTime.utc(2026, 10, 31, 15);
    final asLocal = DateTime.fromMicrosecondsSinceEpoch(
      instant.microsecondsSinceEpoch,
    );
    expect(_at(asLocal), _at(instant));
    expect(_at(asLocal), const KstMonth(2026, 11));
  });

  test('TC-REC-006 연말 경계: 12/31 KST 23:59:59는 2026-12, 15:00Z는 2027-01이다', () {
    expect(
      _at(DateTime.utc(2026, 12, 31, 14, 59, 59)),
      const KstMonth(2026, 12),
    );
    expect(_at(DateTime.utc(2026, 12, 31, 15)), const KstMonth(2027, 1));
  });
}
