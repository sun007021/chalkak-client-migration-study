import 'kst_date.dart';

String _two(int v) => v.toString().padLeft(2, '0');

/// 날짜 표시 문자열(common-infra "날짜 포맷 목록"). 0 패딩 없음, 로캘·기기 시간대 무관.
abstract final class KstFormat {
  /// '일월화수목금토' 순서.
  static const weekdayHeaders = <String>['일', '월', '화', '수', '목', '금', '토'];

  /// '10월 20일 14:00' (24시간제, 연도 없음, D-09).
  static String notificationTime(DateTime instant) {
    final kst = toKstWallClock(instant);
    return '${kst.month}월 ${kst.day}일 ${_two(kst.hour)}:${_two(kst.minute)}';
  }

  /// '10월 20일의 주제'.
  static String topicLabel(KstDate date) => '${date.month}월 ${date.day}일의 주제';

  /// '10월 20일 · 오늘의 주제'.
  static String todayTopicLabel(KstDate date) =>
      '${date.month}월 ${date.day}일 · 오늘의 주제';

  /// 'chalkak-calendar-2026-10.png'.
  static String calendarImageFileName(KstMonth month) =>
      'chalkak-calendar-${month.toApiString()}.png';
}
