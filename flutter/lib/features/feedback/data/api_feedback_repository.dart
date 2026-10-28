import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/feedback_repository.dart';

/// [FeedbackRepository]의 `ApiClient` 구현. 규칙은 인터페이스 문서를 따른다.
class ApiFeedbackRepository implements FeedbackRepository {
  ApiFeedbackRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<FeedbackReceipt> send(String content, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }
}
