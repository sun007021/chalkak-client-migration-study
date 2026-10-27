import 'kst_date.dart';

/// 전시 날짜 이동·선택과 "오늘 주제" 판정 규칙.
abstract final class TopicDateRules {
  /// FIRST_TOPIC_DATE <= target <= today 일 때만 선택 가능(D-12, TIME-007).
  static bool canSelect(KstDate target, {required KstDate today}) =>
      target >= KstDate.firstTopic && target <= today;

  /// 범위 밖이면 가장 가까운 경계로 보정.
  static KstDate clamp(KstDate target, {required KstDate today}) {
    if (target < KstDate.firstTopic) return KstDate.firstTopic;
    if (target > today) return today;
    return target;
  }

  /// 제목 수정 버튼 등: topicDate가 KST 오늘과 같은지(D-23).
  static bool isTodayTopic(KstDate topicDate, {required KstDate today}) =>
      topicDate == today;
}
