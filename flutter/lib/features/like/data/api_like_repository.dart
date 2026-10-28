import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../domain/like_repository.dart';

class ApiLikeRepository implements LikeRepository {
  ApiLikeRepository({required this._client});

  final ApiClient _client;

  @override
  Future<LikeResult> like(String postId, {CancelToken? cancelToken}) => _send(
    HttpMethod.put,
    postId,
    expectLiked: true,
    cancelToken: cancelToken,
  );

  @override
  Future<LikeResult> unlike(String postId, {CancelToken? cancelToken}) => _send(
    HttpMethod.delete,
    postId,
    expectLiked: false,
    cancelToken: cancelToken,
  );

  Future<LikeResult> _send(
    HttpMethod method,
    String postId, {
    required bool expectLiked,
    CancelToken? cancelToken,
  }) {
    return _client.request<LikeResult>(
      ApiRequest(method, '/posts/${Uri.encodeComponent(postId)}/likes'),
      decode: (json) {
        final map = json! as Map;
        final result = LikeResult(
          postId: map['postId']! as String,
          likeCount: map['likeCount']! as int,
          isLiked: map['isLiked']! as bool,
        );
        final consistent =
            result.postId == postId &&
            result.likeCount >= 0 &&
            result.isLiked == expectLiked;
        if (!consistent) {
          throw ApiError.invalidResponse(
            cause: const FormatException('좋아요 응답이 요청과 모순된다'),
          );
        }
        return result;
      },
      cancelToken: cancelToken,
    );
  }
}
