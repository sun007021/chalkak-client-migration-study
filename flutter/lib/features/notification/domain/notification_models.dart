import '../../../core/time/kst_format.dart';

/// 알림 `type`. 알 수 없는 값은 [unknown](REQ-NOTI-021, TC-NOTI-024).
enum NotificationType {
  postApproved('POST_APPROVED'),
  postRejected('POST_REJECTED'),
  aiReviewCompleted('AI_REVIEW_COMPLETED'),
  aiReviewFailed('AI_REVIEW_FAILED'),
  notice('NOTICE'),
  topic('TOPIC'),
  reminder('REMINDER'),
  unknown('');

  const NotificationType(this.wire);
  final String wire;

  static NotificationType fromWire(String raw) {
    for (final t in values) {
      if (t != unknown && t.wire == raw) return t;
    }
    return unknown;
  }
}

/// 알림함 목록의 알림 하나(`GET /notifications`, REQ-NOTI-003).
class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.rawType,
    required this.title,
    required this.body,
    required this.createdAt,
    this.sourceType,
    this.sourceId,
    this.thumbnailImageUrl,
    this.readAt,
  });

  final String id;
  final NotificationType type;

  /// 서버가 보낸 type 원문.
  final String rawType;
  final String? sourceType;
  final String? sourceId;

  /// 서버가 준 문자열 그대로 보여 준다(REQ-NOTI-004).
  final String title;
  final String body;
  final String? thumbnailImageUrl;

  /// null이면 미읽음.
  final DateTime? readAt;

  /// UTC Instant.
  final DateTime createdAt;

  bool get isUnread => readAt == null;

  /// KST "M월 d일 HH:mm"(REQ-NOTI-033, D-09). 기기 시간대·로캘과 무관하다.
  String get timeLabel => KstFormat.notificationTime(createdAt);

  /// 이미 읽은 항목이면 최초 [readAt]을 유지한다(TC-NOTI-037).
  NotificationItem markRead(DateTime at) {
    if (readAt != null) return this;
    return NotificationItem(
      id: id,
      type: type,
      rawType: rawType,
      title: title,
      body: body,
      createdAt: createdAt,
      sourceType: sourceType,
      sourceId: sourceId,
      thumbnailImageUrl: thumbnailImageUrl,
      readAt: at,
    );
  }
}

/// `GET /notifications` 한 페이지.
class NotificationPage {
  const NotificationPage({
    required this.currentPage,
    required this.pageSize,
    required this.hasNext,
    required this.items,
  });

  final int currentPage;
  final int pageSize;
  final bool hasNext;
  final List<NotificationItem> items;
}

/// `GET /notifications/{id}`(REQ-NOTI-023). 조회만으로는 읽음 처리되지 않는다.
class NotificationDetail {
  const NotificationDetail({
    required this.id,
    required this.type,
    required this.rawType,
    required this.title,
    required this.body,
    required this.createdAt,
    this.originalImageUrl,
    this.rejectionReason,
    this.readAt,
  });

  final String id;
  final NotificationType type;
  final String rawType;
  final String title;
  final String body;
  final String? originalImageUrl;
  final String? rejectionReason;
  final DateTime? readAt;
  final DateTime createdAt;
}
