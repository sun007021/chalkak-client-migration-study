import 'package:dio/dio.dart';

import 'notification_settings.dart';

/// 푸시 수신 설정 API. 오류는 `ApiError`로 던진다.
abstract interface class NotificationSettingsRepository {
  /// `GET /notification-settings`. 세 필드(`topicPushEnabled`, `moderationPushEnabled`,
  /// `aiReviewPushEnabled`)가 모두 Boolean이어야 한다. 하나라도 없거나 null이거나 Boolean이
  /// 아니면 `ApiError.invalidResponse`(계약 위반, TC-SET-015). 꺼진 값도 그대로 읽는다(TC-SET-014).
  Future<NotificationSettings> fetch({CancelToken? cancelToken});

  /// `PATCH /notification-settings`. 본문은 바꾼 항목 하나뿐이다: `{<setting.wireKey>: enabled}`
  /// (나머지 필드 생략, 빈 본문 금지, TC-SET-019~021, 036). 204 본문 없음이 성공이며 본문을
  /// 해석하지 않는다(TC-SET-022). PATCH는 멱등이라 `ApiClient`가 연결 실패·5xx에서 0.5초, 1초
  /// 백오프로 최대 2회 재시도한다(D-21, TC-SET-035). 이 계층에서 따로 재시도하지 않는다.
  Future<void> update(
    PushSetting setting,
    bool enabled, {
    CancelToken? cancelToken,
  });
}
