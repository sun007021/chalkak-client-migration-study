import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/latest_request_guard.dart';
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

  NotificationDetailState _state = const NotificationDetailState();
  final CancelToken _token = CancelToken();
  final LatestRequestGuard _guard = LatestRequestGuard();
  bool _disposed = false;
  bool _screenViewLogged = false;

  NotificationDetailState get state => _state;

  Future<void> start() async {
    if (!_screenViewLogged) {
      _screenViewLogged = true;
      _analytics.logEvent(
        AnalyticsEvent.screenView(ScreenNames.notificationDetail),
      );
    }
    await _load();
  }

  Future<void> retry() => _load();

  Future<void> _load() async {
    if (_disposed) return;
    _set(const NotificationDetailState());
    try {
      final detail = await _guard.run(
        () => _repository.fetchDetail(_notificationId, cancelToken: _token),
      );
      if (_disposed || detail == null) return;
      _set(
        NotificationDetailState(status: DetailStatus.content, detail: detail),
      );
    } on Object catch (error) {
      if (_disposed) return;
      await _onFailed(error);
    }
  }

  Future<void> _onFailed(Object error) async {
    if (error is ApiError) {
      if (error.isCancelled) return;
      if (error.status == 401) {
        _navigator.goToLogin();
        return;
      }
      if (error.status == 404) {
        // 이전에 보던 알림 정보를 대신 보여 주지 않는다. 목록과 점도 서버 기준으로 맞춘다.
        _set(const NotificationDetailState(status: DetailStatus.notFound));
        await _refreshOthers();
        return;
      }
      _set(
        NotificationDetailState(
          status: DetailStatus.error,
          errorMessage: error.isNetwork
              ? Copy.notiNetwork
              : Copy.notiDetailError,
        ),
      );
      return;
    }
    _set(
      const NotificationDetailState(
        status: DetailStatus.error,
        errorMessage: Copy.notiDetailError,
      ),
    );
  }

  Future<void> _refreshOthers() async {
    try {
      await _refreshInbox();
    } on Object {
      // 이전 표시를 유지한다.
    }
    try {
      await _unread.refreshUnread();
    } on Object {
      // 이전 표시를 유지한다.
    }
  }

  Future<void> onBackToInboxPressed() async {
    if (_disposed) return;
    await _navigator.backToInbox();
  }

  @override
  void dispose() {
    _disposed = true;
    _token.cancel();
    _guard.invalidate();
    super.dispose();
  }

  void _set(NotificationDetailState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }
}
