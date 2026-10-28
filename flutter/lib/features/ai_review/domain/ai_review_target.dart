import '../../../core/time/kst_date.dart';

/// 세션이 맡는 게시물. [topicDate]는 상세의 `topic.topicDate`(REQ-AIR-003).
class AiReviewTarget {
  const AiReviewTarget({required this.postId, required this.topicDate});

  /// 호스트(상세·홈)가 게시물이 내 것임을 알았을 때만 대상을 만든다. 남의 게시물이거나
  /// 날짜를 아직 모르면(상세 응답 전) null이다. null 대상은 알약도 요청도 없다(REQ-AIR-001, 007).
  static AiReviewTarget? forPost({
    required String postId,
    required bool isMine,
    required KstDate? topicDate,
  }) {
    throw UnimplementedError();
  }

  final String postId;
  final KstDate topicDate;

  @override
  bool operator ==(Object other) =>
      other is AiReviewTarget &&
      other.postId == postId &&
      other.topicDate == topicDate;

  @override
  int get hashCode => Object.hash(postId, topicDate);
}

/// 세션이 놓인 화면. 규칙이 갈리는 곳은 두 가지다.
/// - [feed]: 다시 들어오면 완료 결과도 `GET`으로 갱신한다(REQ-AIR-051). 재요청은 재요청 시트를 거친다.
/// - [home]: 같은 게시물의 완료 결과는 다시 조회하지 않고 유지하며 처리 중이면 조회를 재개한다
///   (REQ-AIR-051). 실패 재요청은 시트 없이 바로 `POST`한다(REQ-AIR-036).
enum AiReviewSurface { feed, home }
