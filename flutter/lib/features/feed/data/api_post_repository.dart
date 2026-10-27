import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/post_detail.dart';
import '../domain/post_repository.dart';

class ApiPostRepository implements PostRepository {
  ApiPostRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<PostDetail> fetchDetail(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<PostTitleResult> updateTitle(
    String postId,
    String? title, {
    CancelToken? cancelToken,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> deletePost(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }
}
