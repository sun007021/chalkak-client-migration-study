import 'kst_date.dart';

/// `package:clock`의 현재 시각에서만 KST 날짜를 계산한다(`withClock`으로 주입).
class KstClock {
  const KstClock();

  KstDate today() => throw UnimplementedError();

  /// 기록 탭 현재 달(D-19). 호출할 때마다 다시 계산한다.
  KstMonth currentMonth() => throw UnimplementedError();

  /// 다음 KST 자정까지 남은 시간. 자정 정각이면 24시간.
  Duration untilNextMidnight() => throw UnimplementedError();

  /// [since] 이후 KST 날짜가 바뀌었는지(포그라운드 복귀 판정).
  bool hasDayChangedSince(KstDate since) => throw UnimplementedError();
}
