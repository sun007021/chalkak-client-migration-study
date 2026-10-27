import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/time/kst_date.dart';
import '../domain/display_models.dart';
import '../domain/display_repository.dart';

class ApiDisplayRepository implements DisplayRepository {
  ApiDisplayRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<DisplayTopic> fetchTopic(KstDate date, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<PostPage> fetchPosts({
    required KstDate topicDate,
    required DisplaySort sort,
    required int page,
    String? randomSeed,
    CancelToken? cancelToken,
  }) {
    throw UnimplementedError();
  }
}
