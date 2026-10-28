import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../domain/ai_review_models.dart';
import '../domain/ai_review_repository.dart';

/// [AiReviewRepository]의 `ApiClient` 구현. 검증 규칙은 인터페이스 문서를 따른다.
/// 서버 `message`·HTTP 상태는 `ApiError`에 그대로 보존하고 취소는 통신 오류로 바꾸지 않는다(D-02).
/// `POST`는 `RetryPolicy`가 재시도 대상에서 빼므로 자동 재전송되지 않는다(D-21).
class ApiAiReviewRepository implements AiReviewRepository {
  ApiAiReviewRepository({required this._client});

  final ApiClient _client;

  @override
  Future<AiReview> get(String postId, {CancelToken? cancelToken}) {
    return _client.request<AiReview>(
      ApiRequest.get(_path(postId)),
      decode: _decode,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<AiReview> request(String postId, {CancelToken? cancelToken}) {
    return _client.request<AiReview>(
      ApiRequest(HttpMethod.post, _path(postId)),
      decode: _decode,
      cancelToken: cancelToken,
    );
  }

  static String _path(String postId) => '/posts/$postId/ai-review';

  /// 규칙을 어기면 [FormatException]을 던지고 ApiClient가 invalidResponse로 바꾼다.
  static AiReview _decode(Object? json) {
    final map = _map(json, 'body');
    final status = switch (map['status']) {
      'NONE' => AiReviewStatus.none,
      'PROCESSING' => AiReviewStatus.processing,
      'COMPLETED' => AiReviewStatus.completed,
      'FAILED' => AiReviewStatus.failed,
      final other => throw FormatException('알 수 없는 status', other),
    };
    final rawResult = map['result'];
    final AiReviewResult? result;
    if (status == AiReviewStatus.completed) {
      if (rawResult == null) {
        throw const FormatException('COMPLETED인데 result가 없다');
      }
      result = _result(_map(rawResult, 'result'));
    } else {
      if (rawResult != null) {
        throw const FormatException('COMPLETED가 아닌데 result가 있다');
      }
      result = null;
    }
    final again = map['canRequestAgain'];
    return AiReview(
      status: status,
      requestedAt: _time(map['requestedAt']),
      completedAt: _time(map['completedAt']),
      result: result,
      canRequestAgain: again is bool && again,
    );
  }

  static AiReviewResult _result(Map<String, Object?> map) {
    final criteria = map['criteria'];
    if (criteria is! List) throw const FormatException('criteria가 목록이 아니다');
    final feedback = _map(map['feedback'], 'feedback');
    final distinctive = map['distinctivePerspective'];
    if (distinctive is! bool) {
      throw const FormatException('distinctivePerspective가 bool이 아니다');
    }
    return AiReviewResult(
      overallScore: _score(map['overallScore']),
      criteria: [
        for (final item in criteria)
          () {
            final c = _map(item, 'criterion');
            return AiCriterion(
              key: _string(c['key']),
              label: _string(c['label']),
              score: _score(c['score']),
            );
          }(),
      ],
      distinctivePerspective: distinctive,
      feedback: AiFeedback(
        summary: _text(feedback['summary']),
        strength: _text(feedback['strength']),
        weakness: _text(feedback['weakness']),
        suggestion: _text(feedback['suggestion']),
      ),
    );
  }

  static Map<String, Object?> _map(Object? value, String name) {
    if (value is Map<String, Object?>) return value;
    throw FormatException('$name이 객체가 아니다', value);
  }

  static String _string(Object? value) {
    if (value is String) return value;
    throw FormatException('문자열이 아니다', value);
  }

  /// feedback 항목은 비어 있으면 안 된다(REQ-AIR-045).
  static String _text(Object? value) {
    final text = _string(value);
    if (text.trim().isEmpty) throw const FormatException('빈 feedback 항목');
    return text;
  }

  /// 0.0~10.0(양 끝 포함). NaN은 비교가 거짓이라 걸러진다(REQ-AIR-042).
  static double _score(Object? value) {
    if (value is! num) throw FormatException('점수가 숫자가 아니다', value);
    final score = value.toDouble();
    if (!(score >= 0.0 && score <= 10.0)) {
      throw FormatException('점수가 범위 밖이다', value);
    }
    return score;
  }

  static DateTime? _time(Object? value) {
    if (value == null) return null;
    if (value is! String) throw FormatException('시각이 문자열이 아니다', value);
    return DateTime.parse(value).toUtc();
  }
}
