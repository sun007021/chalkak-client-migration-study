import '../../../core/time/kst_date.dart';

/// 날짜 선택 시트의 년/월/일 휠 범위(D-12, REQ-DISP-007~009).
/// 범위는 `[KstDate.firstTopic, today]`이다.
abstract final class DatePickerRules {
  static List<int> _range(int from, int to) => [
    for (var i = from; i <= to; i++) i,
  ];

  /// 하한 연도 ~ today 연도, 오름차순.
  static List<int> years({required KstDate today}) =>
      _range(KstDate.firstTopic.year, today.year);

  /// 첫 해는 하한 월부터, 마지막 해는 today 월까지, 그 사이 해는 1~12.
  /// 한 해뿐이면 하한 월 ~ today 월.
  static List<int> months({required int year, required KstDate today}) {
    final first = KstDate.firstTopic;
    return _range(
      year <= first.year ? first.month : 1,
      year >= today.year ? today.month : 12,
    );
  }

  /// 첫 달은 하한 일부터, 마지막 달은 today 일까지, 그 사이 달은 말일까지.
  static List<int> days({
    required int year,
    required int month,
    required KstDate today,
  }) {
    final first = KstDate.firstTopic;
    final isFirstMonth = year == first.year && month == first.month;
    final isLastMonth = year == today.year && month == today.month;
    return _range(
      isFirstMonth ? first.day : 1,
      isLastMonth ? today.day : KstMonth(year, month).daysInMonth,
    );
  }

  /// 휠이 가리킨 (년, 월, 일)을 유효한 날짜로 맞춘다: 그 달에 없는 일은 말일로,
  /// 범위 밖이면 가장 가까운 범위 끝으로(TC-DISP-034·037).
  static KstDate adjust({
    required int year,
    required int month,
    required int day,
    required KstDate today,
  }) {
    final picked = KstDate.clamped(year, month, day);
    if (picked < KstDate.firstTopic) return KstDate.firstTopic;
    if (picked > today) return today;
    return picked;
  }
}
