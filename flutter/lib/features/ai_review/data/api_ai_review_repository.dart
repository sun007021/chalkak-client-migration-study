import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/ai_review_models.dart';
import '../domain/ai_review_repository.dart';

/// [AiReviewRepository]의 `ApiClient` 구현. 검증 규칙은 인터페이스 문서를 따른다.
/// 서버 `message`·HTTP 상태는 `ApiError`에 그대로 보존하고 취소는 통신 오류로 바꾸지 않는다(D-02).
class ApiAiReviewRepository implements AiReviewRepository {
  ApiAiReviewRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<AiReview> get(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<AiReview> request(String postId, {CancelToken? cancelToken}) {
    throw UnimplementedError();
  }
}
