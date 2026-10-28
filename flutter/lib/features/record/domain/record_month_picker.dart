import '../../../core/time/kst_date.dart';

/// 월 선택 휠·시트의 순수 계산(TC-REC-018). 선택지는 `RecordMonths.options` 결과다.
abstract final class RecordMonthPicker {
  /// [options]에 있는 연도를 오름차순·중복 없이.
  static List<int> years(List<KstMonth> options) => throw UnimplementedError();

  /// 연도를 [year]로 바꿨을 때 선택할 달. [year]의 선택지 중 [from]의 월과 가장 가까운 달
  /// (예: 2026-10에서 2025로 바꾸면 2025-12·2025-03 중 12월). 거리가 같으면 더 늦은 달.
  /// [year]에 선택지가 없으면(첫 해 이전·마지막 해 이후) null이라 바꾸지 않는다.
  static KstMonth? monthAfterYearChange({
    required List<KstMonth> options,
    required KstMonth from,
    required int year,
  }) => throw UnimplementedError();
}
