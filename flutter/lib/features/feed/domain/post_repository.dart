import 'package:dio/dio.dart';

import 'post_detail.dart';

/// 게시물 상세·수정·삭제 API. 오류는 [ApiError]로 던진다.
abstract interface class PostRepository {
  /// `GET /posts/{postId}`. 필수 필드가 없거나 타입이 틀리거나 `likeCount`가 음수이면
  /// `ApiError.invalidResponse`. `thumbnailImageUrl`이 null이면 원본으로 대체한다.
  Future<PostDetail> fetchDetail(String postId, {CancelToken? cancelToken});

  /// `PUT /posts/{postId}`, 본문 `{"title": 문자열 | null}`(키는 항상 있다).
  /// [title]은 이미 strip한 값이어야 하며 null이면 `null`을 보낸다.
  Future<PostTitleResult> updateTitle(
    String postId,
    String? title, {
    CancelToken? cancelToken,
  });

  /// `DELETE /posts/{postId}`, 204.
  Future<void> deletePost(String postId, {CancelToken? cancelToken});
}
