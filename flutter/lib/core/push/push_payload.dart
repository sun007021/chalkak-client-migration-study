/// 푸시 `data`의 `type` 값(받는 쪽 계약, notification-push.md "푸시 data 페이로드").
enum PushType {
  topic('TOPIC'),
  reminder('REMINDER'),
  postApproved('POST_APPROVED'),
  postRejected('POST_REJECTED'),
  aiReviewCompleted('AI_REVIEW_COMPLETED'),
  aiReviewFailed('AI_REVIEW_FAILED'),
  notice('NOTICE');

  const PushType(this.wire);
  final String wire;

  /// 알 수 없는 문자열과 null은 null.
  static PushType? fromWire(String? raw) => throw UnimplementedError();
}

/// 플랫폼이 넘겨준 푸시 `data`를 정리한 값(REQ-PUSH-021, TC-PUSH-049~050).
/// - 값이 문자열이 아니면(숫자, 중첩 JSON, 배열) 그 필드는 없는 것으로 본다. 예외를 던지지 않는다.
/// - `aps`, `google.message_id`, `from` 같은 플랫폼 키는 무시한다.
/// - 알림 제목·본문과 `eventId`는 목적지 분기에 쓰지 않는다. [eventId]는 로그용으로만 둔다.
/// - UUID 검증과 소문자 정규화는 라우팅([NotificationRouter])이 한다. 여기서는 문자열 그대로 둔다.
class PushPayload {
  const PushPayload({
    this.type,
    this.notificationId,
    this.sourceType,
    this.sourceId,
    this.eventId,
  });

  /// 평탄한 `data` 맵(iOS `userInfo` 최상위, Android 인텐트 extra, 플러그인 `RemoteMessage.data`)에서 만든다.
  factory PushPayload.fromData(Map<Object?, Object?> data) =>
      throw UnimplementedError();

  /// 서버가 보낸 원문 type. 알려진 값은 [pushType]으로 본다.
  final String? type;
  final String? notificationId;
  final String? sourceType;
  final String? sourceId;
  final String? eventId;

  PushType? get pushType => PushType.fromWire(type);
}

/// 플랫폼별 원본 맵을 같은 [PushPayload]로 바꾼다(TC-PUSH-050).
/// iOS의 중첩 `notification/data` 구조는 가정하지 않는다(그런 맵은 type 없음 = 알림함 폴백).
abstract final class PushPayloadAdapters {
  /// iOS APNs `userInfo`: 커스텀 키가 `aps`와 같은 최상위에 평탄하게 있다.
  static PushPayload fromApnsUserInfo(Map<Object?, Object?> userInfo) =>
      throw UnimplementedError();

  /// Android 인텐트 extras(`google.message_id` 등 플랫폼 키가 섞여 있다).
  static PushPayload fromAndroidExtras(Map<Object?, Object?> extras) =>
      throw UnimplementedError();

  /// Flutter 메시징 플러그인의 `RemoteMessage.data`.
  static PushPayload fromPluginData(Map<Object?, Object?> data) =>
      throw UnimplementedError();
}
