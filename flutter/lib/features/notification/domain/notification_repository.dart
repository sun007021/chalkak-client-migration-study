import 'package:dio/dio.dart';

import 'notification_models.dart';

/// 알림 API. 실패는 [ApiError]로 던진다. 401 갱신·재전송과 D-21 재시도는 ApiClient가 한다.
abstract interface class NotificationRepository {
  /// `GET /notifications?page={page}&pageSize={pageSize}`(Authorization 필요, 기본 pageSize 20).
  /// 필수 필드 누락·깨진 JSON은 `ApiError.invalidResponse`. 알 수 없는 type은 오류가 아니다.
  /// 서버가 준 항목을 날짜로 거르지 않는다(TC-NOTI-023).
  Future<NotificationPage> fetchPage({
    required int page,
    int pageSize = 20,
    CancelToken? cancelToken,
  });

  /// `GET /notifications/{id}`. id는 소문자 UUID로 보낸다.
  Future<NotificationDetail> fetchDetail(
    String notificationId, {
    CancelToken? cancelToken,
  });

  /// `PATCH /notifications/{id}/read`(본문 없음, 204가 성공). 이미 읽은 알림도 서버가 멱등으로 204.
  /// 모든 알림의 읽음 일괄 처리(`read-all`)는 호출하지 않는다(REQ-NOTI-013).
  Future<void> markRead(String notificationId, {CancelToken? cancelToken});
}
