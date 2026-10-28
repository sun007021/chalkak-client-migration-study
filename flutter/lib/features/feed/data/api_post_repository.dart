import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/kst_date.dart';
import '../domain/post_detail.dart';
import '../domain/post_repository.dart';

class ApiPostRepository implements PostRepository {
  ApiPostRepository({required this._client});

  final ApiClient _client;

  static String _path(String postId) => '/posts/${Uri.encodeComponent(postId)}';

  @override
  Future<PostDetail> fetchDetail(String postId, {CancelToken? cancelToken}) {
    return _client.request<PostDetail>(
      ApiRequest.get(_path(postId)),
      decode: _parseDetail,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<PostTitleResult> updateTitle(
    String postId,
    String? title, {
    CancelToken? cancelToken,
  }) {
    return _client.request<PostTitleResult>(
      ApiRequest(HttpMethod.put, _path(postId), body: {'title': title}),
      decode: (json) {
        final map = json! as Map;
        return PostTitleResult(
          postId: map['postId']! as String,
          title: map['title'] as String?,
        );
      },
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> deletePost(String postId, {CancelToken? cancelToken}) {
    return _client.requestNoContent(
      ApiRequest(HttpMethod.delete, _path(postId)),
      cancelToken: cancelToken,
    );
  }

  static PostDetail _parseDetail(Object? json) {
    final map = json! as Map;
    final topic = map['topic']! as Map;
    final likeCount = map['likeCount']! as int;
    if (likeCount < 0) {
      throw ApiError.invalidResponse(
        cause: const FormatException('likeCount가 음수다'),
      );
    }
    final original = map['originalImageUrl']! as String;
    return PostDetail(
      id: map['id']! as String,
      authorId: map['authorId']! as String,
      topicId: topic['id']! as String,
      topicTitle: topic['title']! as String,
      topicDate: KstDate.parse(topic['topicDate']! as String),
      originalImageUrl: original,
      thumbnailImageUrl: (map['thumbnailImageUrl'] as String?) ?? original,
      signatureOriginalImageUrl: map['signatureOriginalImageUrl']! as String,
      title: map['title'] as String?,
      likeCount: likeCount,
      isLiked: map['isLiked']! as bool,
    );
  }
}
