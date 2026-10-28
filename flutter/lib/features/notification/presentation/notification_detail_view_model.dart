// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../domain/notification_models.dart';
import '../domain/notification_navigator.dart';
import '../domain/notification_repository.dart';
import '../domain/unread_refresher.dart';

enum DetailStatus { loading, content, notFound, error }

class NotificationDetailState {
  const NotificationDetailState({
    this.status = DetailStatus.loading,
    this.detail,
    this.errorMessage,
  });

  final DetailStatus status;
  final NotificationDetail? detail;

  /// status == error일 때: 연결 실패는 `Copy.notiNetwork`, 그 밖은 `Copy.notiDetailError`.
  final String? errorMessage;
}

/// 알림 상세(REQ-NOTI-023~027, 014).
/// - [start]: `screen_view notification_detail` 1회 + `GET /notifications/{id}`.
///   조회만으로는 `PATCH read`를 보내지 않는다.
/// - 404: 이전 알림 정보를 대신 보여 주지 않고 [DetailStatus.notFound]. 알림함·미읽음을 새로고침한다.
/// - 연결 실패/그 밖: [DetailStatus.error]. [retry]가 다시 요청한다.
/// - [onBackToInboxPressed]: [NotificationNavigator.backToInbox].
class NotificationDetailViewModel extends ChangeNotifier {
  NotificationDetailViewModel({
    required this._notificationId,
    required this._repository,
    required this._navigator,
    required this._unread,
    required this._refreshInbox,
    required this._analytics,
  });

  final String _notificationId;
  final NotificationRepository _repository;
  final NotificationNavigator _navigator;
  final UnreadRefresher _unread;
  final Future<void> Function() _refreshInbox;
  final AnalyticsTracker _analytics;

  NotificationDetailState get state => throw UnimplementedError();

  Future<void> start() => throw UnimplementedError();
  Future<void> retry() => throw UnimplementedError();
  Future<void> onBackToInboxPressed() => throw UnimplementedError();
}
