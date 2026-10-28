import '../../../core/time/kst_date.dart';

/// `GET /posts/{postId}`의 응답. `isMine`이 없으므로 `authorId == userId`로 판정한다(D-26).
class PostDetail {
  const PostDetail({
    required this.id,
    required this.authorId,
    required this.topicId,
    required this.topicTitle,
    required this.topicDate,
    required this.originalImageUrl,
    required this.thumbnailImageUrl,
    required this.signatureOriginalImageUrl,
    required this.title,
    required this.likeCount,
    required this.isLiked,
  });

  final String id;
  final String authorId;
  final String topicId;
  final String topicTitle;
  final KstDate topicDate;
  final String originalImageUrl;

  /// 응답이 null이면 원본으로 대체한 값.
  final String thumbnailImageUrl;
  final String signatureOriginalImageUrl;
  final String? title;
  final int likeCount;
  final bool isLiked;
}

/// `PUT /posts/{postId}`의 응답.
class PostTitleResult {
  const PostTitleResult({required this.postId, required this.title});

  final String postId;
  final String? title;
}
