import '../../../core/time/kst_date.dart';

/// `GET /topics?date=` 응답. [phase]는 서버 문자열 그대로(`OPEN` 등).
class Topic {
  const Topic({
    required this.id,
    required this.title,
    required this.topicDate,
    required this.phase,
  });

  final String id;
  final String title;
  final KstDate topicDate;
  final String phase;
}

/// `GET /posts` 목록의 사진 한 장(홈 랭킹).
class PostSummary {
  const PostSummary({
    required this.id,
    required this.thumbnailImageUrl,
    required this.originalImageUrl,
    required this.likeCount,
    required this.isLiked,
    required this.isMine,
  });

  final String id;
  final String thumbnailImageUrl;
  final String originalImageUrl;
  final int likeCount;
  final bool isLiked;
  final bool isMine;
}

/// 내 게시물 검수 상태. 서버가 `isPosted=true`로 주는 값만 담는다.
/// REJECTED·알 수 없는 값은 파싱 실패(invalidResponse)다.
enum ModerationStatus { validating, pending, approved }

/// `GET /posts/today`.
/// 불변식: `isPosted=false`이면 [postId]·[moderationStatus]가 null,
/// `isPosted=true`이면 둘 다 있다. 어긋나면 파싱 단계에서 invalidResponse(REQ-HOME-017).
class TodayPost {
  const TodayPost({
    required this.topicDate,
    required this.isPosted,
    this.postId,
    this.moderationStatus,
  });

  final KstDate topicDate;
  final bool isPosted;
  final String? postId;
  final ModerationStatus? moderationStatus;
}

/// 캘린더(이번 주 기록)의 칸 상태. 서버는 REJECTED·VALIDATING을 주지 않는다.
enum CalendarStatus { pending, approved }

/// `GET /posts/calendar`의 한 건.
class CalendarEntry {
  const CalendarEntry({
    required this.topicDate,
    required this.postId,
    required this.thumbnailImageUrl,
    required this.status,
  });

  final KstDate topicDate;
  final String postId;
  final String thumbnailImageUrl;
  final CalendarStatus status;
}

/// 이번 주 7칸 중 하루. 기록이 없으면 [entry]가 null.
class WeekDay {
  const WeekDay({required this.date, this.entry});

  final KstDate date;
  final CalendarEntry? entry;
}
