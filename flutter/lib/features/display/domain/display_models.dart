import '../../../core/time/kst_date.dart';

/// `GET /posts`의 `sort` 값(소문자).
enum DisplaySort {
  recent('recent'),
  popular('popular'),
  random('random');

  const DisplaySort(this.wire);
  final String wire;
}

/// `GET /topics?date=`의 응답.
class DisplayTopic {
  const DisplayTopic({
    required this.id,
    required this.title,
    required this.topicDate,
    required this.phase,
  });

  final String id;
  final String title;

  /// 서버가 정한 정규 날짜. 이 값으로 `GET /posts`를 부른다.
  final KstDate topicDate;

  /// OPEN, CLOSED, BEFORE_OPEN 등. 조회 가능 여부와 무관하다(TC-DISP-009).
  final String phase;
}

/// 전시 목록 한 장. 좋아요 값은 [LikeStore]가 따로 들고 있고, 이 값은 응답 시점의 것이다.
class PostCard {
  const PostCard({
    required this.id,
    required this.authorId,
    required this.originalImageUrl,
    required this.thumbnailImageUrl,
    required this.signatureOriginalImageUrl,
    required this.signatureThumbnailImageUrl,
    required this.title,
    required this.likeCount,
    required this.isLiked,
    required this.isMine,
  });

  final String id;
  final String authorId;
  final String originalImageUrl;

  /// 응답에 없으면(null) 원본을 쓴다.
  final String thumbnailImageUrl;
  final String signatureOriginalImageUrl;
  final String? signatureThumbnailImageUrl;
  final String? title;
  final int likeCount;
  final bool isLiked;
  final bool isMine;

  PostCard copyWith({
    String? title,
    bool clearTitle = false,
    int? likeCount,
    bool? isLiked,
    bool? isMine,
  }) => PostCard(
    id: id,
    authorId: authorId,
    originalImageUrl: originalImageUrl,
    thumbnailImageUrl: thumbnailImageUrl,
    signatureOriginalImageUrl: signatureOriginalImageUrl,
    signatureThumbnailImageUrl: signatureThumbnailImageUrl,
    title: clearTitle ? null : (title ?? this.title),
    likeCount: likeCount ?? this.likeCount,
    isLiked: isLiked ?? this.isLiked,
    isMine: isMine ?? this.isMine,
  );
}

/// `GET /posts`의 한 페이지.
class PostPage {
  const PostPage({
    required this.currentPage,
    required this.pageSize,
    required this.hasNext,
    required this.randomSeed,
    required this.posts,
  });

  final int currentPage;
  final int pageSize;
  final bool hasNext;

  /// 랜덤순 첫 페이지 응답에서만 의미가 있다.
  final String? randomSeed;

  final List<PostCard> posts;
}
