import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/like_repository.dart';

class ApiLikeRepository implements LikeRepository {
  ApiLikeRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<LikeResult> like(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<LikeResult> unlike(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }
}
