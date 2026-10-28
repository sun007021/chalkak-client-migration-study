import '../../../core/time/kst_date.dart';
import '../../display/domain/display_models.dart';

/// 상세를 연 경로(REQ-FEED-001·002).
enum FeedOrigin {
  /// 전시 그리드·추천 카드. 목록의 값이 시드이고 `isMine`도 목록 값이다.
  display,

  /// 홈 랭킹. 전시와 같다.
  home,

  /// 기록의 "피드에서 보기". 내 게시물이고 썸네일만 시드로 받을 수 있다.
  record,

  /// 푸시(`POST_APPROVED`, `AI_REVIEW_*`). 내 게시물이고 시드가 없다.
  push,
}

/// 상세 응답 전에 먼저 보여 줄 값(전시·랭킹에서 연 경우).
class FeedSeed {
  const FeedSeed({
    required this.originalImageUrl,
    required this.signatureImageUrl,
    required this.title,
    required this.likeCount,
    required this.isLiked,
    required this.authorId,
    required this.topicDate,
  });

  /// 목록 항목과 그 목록의 날짜로 만든다. 사인은 원본 URL을 쓴다.
  factory FeedSeed.fromCard(PostCard card, {required KstDate topicDate}) =>
      FeedSeed(
        originalImageUrl: card.originalImageUrl,
        signatureImageUrl: card.signatureOriginalImageUrl,
        title: card.title,
        likeCount: card.likeCount,
        isLiked: card.isLiked,
        authorId: card.authorId,
        topicDate: topicDate,
      );

  final String originalImageUrl;
  final String? signatureImageUrl;
  final String? title;
  final int likeCount;
  final bool isLiked;
  final String authorId;

  /// 목록이 속한 날짜. 상세 응답 전 수정 버튼 판정에 쓴다.
  final KstDate topicDate;
}

/// 상세 화면을 여는 인자.
class FeedTarget {
  const FeedTarget({
    required this.postId,
    required this.origin,
    this.seed,
    this.isMine = false,
    this.thumbnailUrl,
  });

  /// 전시·홈 랭킹의 카드로 연다. `isMine`은 카드 값이다.
  factory FeedTarget.fromCard(
    PostCard card, {
    required KstDate topicDate,
    FeedOrigin origin = FeedOrigin.display,
  }) => FeedTarget(
    postId: card.id,
    origin: origin,
    seed: FeedSeed.fromCard(card, topicDate: topicDate),
    isMine: card.isMine,
  );

  final String postId;
  final FeedOrigin origin;
  final FeedSeed? seed;

  /// 상세 응답 전에 쓰는 내 게시물 여부(D-26). 기록·푸시는 true.
  final bool isMine;

  /// 기록에서 넘겨받는 썸네일(상세 응답 전 표시용).
  final String? thumbnailUrl;
}
