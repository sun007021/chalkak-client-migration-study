import 'dart:async';

import 'package:dio/dio.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'notification_navigator.dart';
import 'notification_repository.dart';
import 'notification_route.dart';
import 'unread_refresher.dart';

/// [NotificationTapRunner.run]의 결과.
enum TapResult {
  /// 읽음 성공(또는 읽음이 필요 없는 계획) 후 이동했다.
  navigated,

  /// 읽음이 연결 실패·타임아웃이라 토스트 `noti.read.error.network` 후 이동했다. 행은 미읽음 그대로.
  navigatedReadFailed,

  /// 404와 그 밖의 읽음 실패: 이동하지 않고 토스트 `noti.gone`, 목록·미읽음 새로고침.
  gone,

  /// 401(갱신 후에도 UNAUTHORIZED, 또는 REAUTHENTICATION_REQUIRED): 로그인 화면으로 보냈고 이동하지 않았다.
  loginRequired,

  /// 화면 이탈(취소)·계정 전환으로 결과를 버렸다. 이동·토스트가 없다.
  cancelled,
}

/// 알림함 행 탭과 푸시 탭이 함께 쓰는 "읽음 후 이동"(D-11, REQ-NOTI-015~019, REQ-PUSH-027).
/// - `readNotificationId`가 있으면 `markRead`를 먼저 보낸다. 없으면 바로 이동한다.
/// - 읽음 성공: 이동하고 미읽음을 다시 조회한다(REQ-NOTI-029).
/// - 연결 실패: 토스트 후 이동. 404·5xx·403·400: 이동 안 함, 토스트 `noti.gone`,
///   `refreshInbox`와 미읽음 새로고침(D-24).
/// - 401: `navigator.goToLogin()`, 이동 없음.
/// - 취소(CancelToken)와 [clearAll](로그아웃·계정 전환) 뒤 도착한 응답은 버린다. 오류로 바꾸지 않는다.
class NotificationTapRunner implements UserDataCleaner {
  NotificationTapRunner({
    required this._repository,
    required this._navigator,
    required this._toast,
    required this._unread,
    required this._refreshInbox,
  });

  final NotificationRepository _repository;
  final NotificationNavigator _navigator;
  final ToastSink _toast;
  final UnreadRefresher _unread;

  /// 열려 있는 알림함 목록을 첫 페이지부터 다시 불러온다(없으면 아무것도 하지 않는다).
  final Future<void> Function() _refreshInbox;

  /// [clearAll]마다 올라간다. 요청을 보낸 시점의 값과 다르면 계정이 바뀐 것이다.
  int _generation = 0;
  final Set<CancelToken> _inflight = {};

  Future<TapResult> run(NavigatePlan plan, {CancelToken? cancelToken}) async {
    final readId = plan.readNotificationId;
    if (readId == null) {
      if (cancelToken?.isCancelled ?? false) return TapResult.cancelled;
      await _navigate(plan.destination);
      return TapResult.navigated;
    }

    final generation = _generation;
    // clearAll이 진행 중 요청을 끊을 수 있도록 호출자의 토큰과 별개의 토큰을 쓴다.
    final own = CancelToken();
    _inflight.add(own);
    final link = cancelToken?.whenCancel.then((_) {
      if (!own.isCancelled) own.cancel();
    });
    // link는 결과를 쓰지 않는다. 오류가 나도 처리되지 않은 예외로 번지지 않게 한다.
    if (link != null) unawaited(link.catchError((Object _) {}));

    try {
      await _repository.markRead(readId, cancelToken: own);
    } on Object catch (error) {
      if (_isStale(generation, own, cancelToken)) return TapResult.cancelled;
      return _onReadFailed(error, plan.destination);
    } finally {
      _inflight.remove(own);
    }
    if (_isStale(generation, own, cancelToken)) return TapResult.cancelled;

    await _navigate(plan.destination);
    await _safely(_unread.refreshUnread);
    return TapResult.navigated;
  }

  bool _isStale(int generation, CancelToken own, CancelToken? caller) =>
      generation != _generation ||
      own.isCancelled ||
      (caller?.isCancelled ?? false);

  Future<TapResult> _onReadFailed(
    Object error,
    NotificationDestination destination,
  ) async {
    if (error is ApiError) {
      if (error.isCancelled) return TapResult.cancelled;
      if (error.status == 401) {
        _navigator.goToLogin();
        return TapResult.loginRequired;
      }
      if (error.isNetwork) {
        _toast.show(Copy.notiReadErrorNetwork);
        await _navigate(destination);
        return TapResult.navigatedReadFailed;
      }
    }
    // 404, 403, 400, 5xx, 응답 계약 위반은 같다: 사라졌거나 처리할 수 없는 알림이다(D-24).
    _toast.show(Copy.notiGone);
    await _safely(_refreshInbox);
    await _safely(_unread.refreshUnread);
    return TapResult.gone;
  }

  Future<void> _navigate(NotificationDestination destination) {
    return switch (destination) {
      HomeDestination(:final scrollToTopAndRefresh) => _navigator.openHome(
        scrollToTopAndRefresh: scrollToTopAndRefresh,
      ),
      InboxDestination() => _navigator.openInbox(),
      FeedDestination(:final target, :final openAiFeedback) =>
        _navigator.openFeed(target, openAiFeedback: openAiFeedback),
      NotificationDetailDestination(:final notificationId) =>
        _navigator.openNotificationDetail(notificationId),
    };
  }

  /// 미읽음·목록 새로고침 실패는 이동 결과에 영향을 주지 않는다.
  Future<void> _safely(Future<void> Function() action) async {
    try {
      await action();
    } on Object {
      // 이전 표시를 유지한다.
    }
  }

  /// 진행 중인 읽음 요청의 결과를 버리게 한다.
  @override
  Future<void> clearAll() async {
    _generation++;
    for (final token in List.of(_inflight)) {
      if (!token.isCancelled) token.cancel();
    }
  }
}
