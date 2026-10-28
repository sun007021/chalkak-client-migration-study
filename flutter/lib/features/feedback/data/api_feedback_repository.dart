import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../domain/feedback_repository.dart';

/// [FeedbackRepository]의 `ApiClient` 구현. 규칙은 인터페이스 문서를 따른다.
/// POST는 `RetryPolicy`가 재시도 대상에서 빼므로 자동 재시도하지 않는다(D-21).
class ApiFeedbackRepository implements FeedbackRepository {
  ApiFeedbackRepository({required this._client});

  final ApiClient _client;

  @override
  Future<FeedbackReceipt> send(String content, {CancelToken? cancelToken}) {
    return _client.request<FeedbackReceipt>(
      ApiRequest(HttpMethod.post, '/feedbacks', body: {'content': content}),
      decode: (json) {
        if (json is! Map) throw ApiError.invalidResponse();
        final id = json['feedbackId'];
        final created = json['createdAt'];
        final createdAt = created is String ? DateTime.tryParse(created) : null;
        if (id is! String || createdAt == null) {
          throw ApiError.invalidResponse();
        }
        return FeedbackReceipt(feedbackId: id, createdAt: createdAt.toUtc());
      },
      cancelToken: cancelToken,
    );
  }
}
