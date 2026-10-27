import 'kst_date.dart';

/// 날짜 표시 문자열(common-infra "날짜 포맷 목록"). 0 패딩 없음, 로캘·기기 시간대 무관.
abstract final class KstFormat {
  /// '일월화수목금토' 순서.
  static const weekdayHeaders = <String>['일', '월', '화', '수', '목', '금', '토'];

  /// '10월 20일 14:00' (24시간제, 연도 없음, D-09).
  static String notificationTime(DateTime instant) =>
      throw UnimplementedError();

  /// '10월 20일의 주제'.
  static String topicLabel(KstDate date) => throw UnimplementedError();

  /// '10월 20일 · 오늘의 주제'.
  static String todayTopicLabel(KstDate date) => throw UnimplementedError();

  /// 'chalkak-calendar-2026-10.png'.
  static String calendarImageFileName(KstMonth month) =>
      throw UnimplementedError();
}
