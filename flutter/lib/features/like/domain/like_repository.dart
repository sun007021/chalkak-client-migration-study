import 'package:dio/dio.dart';

/// `PUT/DELETE /posts/{postId}/likes`의 응답.
class LikeResult {
  const LikeResult({
    required this.postId,
    required this.likeCount,
    required this.isLiked,
  });

  final String postId;
  final int likeCount;
  final bool isLiked;
}

/// 좋아요 API. 실패는 [ApiError]로 던진다.
abstract interface class LikeRepository {
  /// `PUT /posts/{postId}/likes`(본문 없음). 응답이 계약을 어기면
  /// (postId 불일치, `isLiked == false`, 음수 likeCount) `ApiError.invalidResponse`.
  Future<LikeResult> like(String postId, {CancelToken? cancelToken});

  /// `DELETE /posts/{postId}/likes`(본문 없음). 응답의 `isLiked`가 true이면 invalidResponse.
  Future<LikeResult> unlike(String postId, {CancelToken? cancelToken});
}
