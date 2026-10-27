import 'kst_date.dart';

/// 일요일~토요일 한 주.
class KstWeek {
  const KstWeek._(this.days);

  /// [date]가 속한 주.
  factory KstWeek.containing(KstDate date) {
    final start = date.addDays(-date.weekdayIndex);
    return KstWeek._(
      List.unmodifiable([for (var i = 0; i < 7; i++) start.addDays(i)]),
    );
  }

  /// 길이 7, days[0]이 일요일.
  final List<KstDate> days;

  KstDate get start => days.first;
  KstDate get end => days.last;

  /// 주가 걸친 연월(1개 또는 2개, 오름차순). 캘린더 요청은 모두에 나간다.
  List<KstMonth> get months {
    final first = start.yearMonth;
    final last = end.yearMonth;
    return first == last ? [first] : [first, last];
  }
}
