import 'package:dio/dio.dart';

import 'ai_review_models.dart';

/// AI 피드백 API. 실패는 `ApiError`로 던진다.
///
/// 두 메서드는 같은 응답 형식을 같은 규칙으로 검증한다. 하나라도 어기면 `ApiError.invalidResponse`:
/// - `status`가 NONE·PROCESSING·COMPLETED·FAILED가 아니다(REQ-AIR-043).
/// - `COMPLETED`인데 `result`가 없거나, `COMPLETED`가 아닌데 `result`가 있다(REQ-AIR-043).
/// - `overallScore`나 `criteria[].score`가 0.0~10.0(양 끝 포함)이 아니거나 NaN이다(REQ-AIR-042).
/// - `feedback` 네 항목 중 비어 있는 것이 있다(REQ-AIR-045).
abstract interface class AiReviewRepository {
  /// `GET /posts/{postId}/ai-review`(본문 없음). ApiClient의 GET 재시도(D-21)를 그대로 따른다.
  /// 분기는 HTTP 코드가 아니라 본문 `status`로 한다(2xx는 모두 정상).
  Future<AiReview> get(String postId, {CancelToken? cancelToken});

  /// `POST /posts/{postId}/ai-review`(본문 없음). 202·200 모두 본문 `status`로 해석한다.
  /// 자동 재시도·재전송을 하지 않는다(D-21, REQ-AIR-020).
  Future<AiReview> request(String postId, {CancelToken? cancelToken});
}
