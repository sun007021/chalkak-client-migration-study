import 'package:dio/dio.dart';

/// `POST /feedbacks` 201 응답. 화면은 이 값을 쓰지 않는다(REQ-FDBK-015).
class FeedbackReceipt {
  const FeedbackReceipt({required this.feedbackId, required this.createdAt});

  final String feedbackId;

  /// UTC Instant.
  final DateTime createdAt;
}

/// 피드백 API. 오류는 `ApiError`로 던진다.
abstract interface class FeedbackRepository {
  /// `POST /feedbacks` JSON `{content}`만 보낸다(앱 버전·기기 정보 없음, REQ-FDBK-007). [content]는 호출한
  /// 쪽이 trim한 값이며 이 계층은 바꾸지 않는다. Bearer 헤더와 `Content-Type: application/json`을 붙이고
  /// 자동 재시도하지 않는다(D-21, TC-FDBK-024). 201 응답의 `feedbackId`, `createdAt`을 읽는다(TC-FDBK-016).
  Future<FeedbackReceipt> send(String content, {CancelToken? cancelToken});
}
