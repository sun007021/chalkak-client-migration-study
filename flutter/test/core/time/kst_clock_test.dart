import 'package:chalkak/core/time/kst_clock.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';

KstDate todayAt(DateTime instant) =>
    withClock(Clock.fixed(instant), () => const KstClock().today());

void main() {
  const kstClock = KstClock();

  test('TC-TIME-001 UTC 15:00Z는 KST 다음 날이다', () {
    expect(todayAt(DateTime.utc(2026, 10, 26, 15)).toApiString(), '2026-10-27');
  });

  test('TC-TIME-002 UTC 14:59:59Z는 KST 같은 날이다', () {
    expect(
      todayAt(DateTime.utc(2026, 10, 26, 14, 59, 59)).toApiString(),
      '2026-10-26',
    );
  });

  test('TC-TIME-003 같은 순간은 입력 표현(UTC·로컬·오프셋 환산)과 무관하게 같은 KST 날짜', () {
    final instant = DateTime.utc(2026, 10, 26, 15);
    // 서로 다른 기기 시간대에서 만든 같은 순간을 흉내 낸다.
    final variants = <DateTime>[
      instant,
      instant.toLocal(),
      DateTime.fromMillisecondsSinceEpoch(
        instant.millisecondsSinceEpoch,
        isUtc: true,
      ),
      DateTime.fromMillisecondsSinceEpoch(instant.millisecondsSinceEpoch),
    ];
    for (final v in variants) {
      expect(KstDate.fromInstant(v).toApiString(), '2026-10-27');
      expect(todayAt(v).toApiString(), '2026-10-27');
    }
  });

  test('TC-TIME-004 서머타임 전환일 근처에서도 KST 규칙으로 계산한다', () {
    // 미국 DST 시작 2026-03-08 10:00Z(LA 02:00), 종료 2026-11-01 09:00Z.
    expect(
      todayAt(DateTime.utc(2026, 3, 8, 14, 59, 59)).toApiString(),
      '2026-03-08',
    );
    expect(todayAt(DateTime.utc(2026, 3, 8, 15)).toApiString(), '2026-03-09');
    expect(
      todayAt(DateTime.utc(2026, 11, 1, 14, 59, 59)).toApiString(),
      '2026-11-01',
    );
    expect(todayAt(DateTime.utc(2026, 11, 1, 15)).toApiString(), '2026-11-02');
  });

  test('TC-TIME-014 KST 23:59:59 → 00:00:00 자정 계산(가상 시계)', () {
    final before = DateTime.utc(2026, 10, 27, 14, 59, 59); // KST 23:59:59
    final after = DateTime.utc(2026, 10, 27, 15); // KST 00:00:00
    final since = todayAt(before);
    withClock(Clock.fixed(before), () {
      expect(kstClock.untilNextMidnight(), const Duration(seconds: 1));
      expect(kstClock.hasDayChangedSince(since), isFalse);
    });
    withClock(Clock.fixed(after), () {
      expect(kstClock.hasDayChangedSince(since), isTrue);
      expect(kstClock.untilNextMidnight(), const Duration(hours: 24));
    });
  });

  test('TC-TIME-014 자정까지 남은 시간은 KST 기준(정오 → 12시간)', () {
    withClock(Clock.fixed(DateTime.utc(2026, 10, 27, 3)), () {
      expect(kstClock.untilNextMidnight(), const Duration(hours: 12));
    });
  });

  test('TC-TIME-015 TC-TIME-016 백그라운드에서 자정·월말을 넘기고 복귀하면 현재 달 재계산', () {
    final oct31 = DateTime.utc(2026, 10, 31, 14, 59); // KST 10/31 23:59
    final nov1 = DateTime.utc(2026, 10, 31, 15); // KST 11/01 00:00
    final since = todayAt(oct31);
    withClock(Clock.fixed(oct31), () {
      expect(kstClock.currentMonth().toApiString(), '2026-10');
    });
    withClock(Clock.fixed(nov1), () {
      expect(kstClock.hasDayChangedSince(since), isTrue);
      expect(kstClock.currentMonth().toApiString(), '2026-11');
    });
  });

  test('TC-TIME-016 연말 경계: 12/31 → 1/1에 연도가 넘어간다', () {
    withClock(Clock.fixed(DateTime.utc(2026, 12, 31, 15)), () {
      expect(kstClock.currentMonth().toApiString(), '2027-01');
    });
  });
}
