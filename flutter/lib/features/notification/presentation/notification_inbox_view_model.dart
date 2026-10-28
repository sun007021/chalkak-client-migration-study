import 'dart:async';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/latest_request_guard.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../domain/notification_models.dart';
import '../domain/notification_repository.dart';
import '../domain/notification_route.dart';
import '../domain/notification_tap_runner.dart';

enum InboxStatus { loading, content, empty, error }

/// 알림함 상태(불변 값). 일회성 이벤트는 [NotificationInboxViewModel.events]로 낸다.
class NotificationInboxState {
  const NotificationInboxState({
    this.status = InboxStatus.loading,
    this.items = const [],
    this.hasNext = false,
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.errorMessage,
    this.processingIds = const {},
  });

  final InboxStatus status;

  /// 응답 순서(최신순), 중복 id 제거(REQ-NOTI-007).
  final List<NotificationItem> items;
  final bool hasNext;
  final bool isRefreshing;
  final bool isLoadingMore;

  /// status == error일 때의 문구(`Copy.notiNetwork` 또는 `Copy.notiInboxError`).
  final String? errorMessage;

  /// 읽음 요청이 진행 중인 행 id(중복 탭 무시).
  final Set<String> processingIds;
}

sealed class InboxEvent {
  const InboxEvent();
}

/// 401로 로그인이 필요하다(갱신 후에도 UNAUTHORIZED, REAUTHENTICATION_REQUIRED).
final class InboxLoginRequired extends InboxEvent {
  const InboxLoginRequired();
}

/// 알림함 목록(REQ-NOTI-001~012, 014, 021~022).
/// - [start]: `screen_view notifications` 1회 + `GET page=1&pageSize=20`. 로딩 -> 콘텐츠/빈/오류.
/// - 첫 로딩 실패(콘텐츠 없음): 연결 실패는 `Copy.notiNetwork`, 그 밖은 `Copy.notiInboxError`; [retry]는 재요청.
///   응답 계약 위반도 `notiInboxError`이며 크래시하지 않는다. 목록 404는 D-24 통일 문구 `Copy.notiGone`을
///   오류 화면 문구로 쓰고(옛 "만료되었거나 삭제됐어요" 문구 금지), [retry]가 다시 불러온다(TC-NOTI-010 해석).
///   401은 [InboxLoginRequired]이고 오류 문구는 없다.
/// - [refresh](당겨서): 성공하면 목록을 교체하고 페이지를 1로. 실패하면 기존 목록을 유지하고
///   `Copy.notiInboxRefreshError` 토스트. 겹친 새로고침은 늦게 끝난 이전 응답을 버린다.
/// - [onVisibleIndexChanged]: 마지막 4개 안(index >= length - 4)이고 hasNext이며 진행 중이 아니면
///   다음 페이지를 1회 요청한다. 실패하면 목록·페이지를 유지하고 `Copy.notiInboxMoreError` 토스트,
///   다시 스크롤하면 같은 페이지를 다시 요청한다.
/// - [onResumed]: 상세·피드에서 돌아올 때 첫 페이지를 조용히 다시 불러온다(실패해도 토스트 없음).
/// - [onItemTapped]: [NotificationRouter.fromInboxItem]이 null이면 아무 일도 없다. 아니면 [NotificationTapRunner]로
///   읽음 후 이동하고, 읽음에 성공했으면 해당 행만 읽음으로 바꾼다(이미 읽은 행의 readAt은 유지).
///   처리 중인 행의 연타는 무시한다. 401이면 [InboxLoginRequired].
/// - 화면 이탈([dispose])은 진행 중 요청을 취소하고 오류 토스트를 내지 않는다.
class NotificationInboxViewModel extends ChangeNotifier {
  NotificationInboxViewModel({
    required this._repository,
    required this._runner,
    required this._toast,
    required this._analytics,
  });

  final NotificationRepository _repository;
  final NotificationTapRunner _runner;
  final ToastSink _toast;
  final AnalyticsTracker _analytics;

  NotificationInboxState _state = const NotificationInboxState();
  final StreamController<InboxEvent> _events =
      StreamController<InboxEvent>.broadcast();
  final LatestRequestGuard _reloadGuard = LatestRequestGuard();
  final LatestRequestGuard _moreGuard = LatestRequestGuard();
  final CancelToken _screenToken = CancelToken();
  CancelToken? _reloadToken;
  bool _disposed = false;
  bool _screenViewLogged = false;

  /// 다음에 요청할 페이지 번호.
  int _nextPage = 2;

  @override
  NotificationInboxState get state => _state;
  Stream<InboxEvent> get events => _events.stream;

  /// 열려 있는 동안 [NotificationTapRunner]의 `refreshInbox`로 연결하는 첫 페이지 새로고침.
  /// 조용한 갱신이라 실패해도 토스트가 없고 기존 목록을 유지한다.
  Future<void> reloadFirstPage() => onResumed();

  Future<void> start() async {
    if (!_screenViewLogged) {
      _screenViewLogged = true;
      _analytics.logEvent(AnalyticsEvent.screenView(ScreenNames.notifications));
    }
    await _loadFirst();
  }

  Future<void> retry() => _loadFirst();

  /// 콘텐츠 없이 처음 불러오거나 다시 시도할 때. 오류 화면을 로딩으로 되돌린다.
  Future<void> _loadFirst() async {
    if (_disposed) return;
    _set(
      const NotificationInboxState(), // 로딩, 목록 없음
    );
    try {
      final page = await _reloadGuard.run(() => _fetchFirst());
      if (_disposed || page == null) return;
      _applyFirstPage(page);
    } on Object catch (error) {
      if (_disposed) return;
      _onFirstLoadFailed(error);
    }
  }

  Future<NotificationPage> _fetchFirst() {
    _reloadToken?.cancel();
    final token = _reloadToken = CancelToken();
    // 화면을 떠나면 진행 중 요청도 취소한다.
    _screenToken.whenCancel.then((_) {
      if (!token.isCancelled) token.cancel();
    });
    return _repository.fetchPage(page: 1, cancelToken: token);
  }

  void _applyFirstPage(NotificationPage page) {
    _moreGuard.invalidate();
    _nextPage = 2;
    final items = _dedupe(const [], page.items);
    _set(
      NotificationInboxState(
        status: items.isEmpty ? InboxStatus.empty : InboxStatus.content,
        items: items,
        hasNext: page.hasNext,
      ),
    );
  }

  void _onFirstLoadFailed(Object error) {
    if (error is ApiError) {
      if (error.isCancelled) return;
      if (error.status == 401) {
        _emit(const InboxLoginRequired());
        return;
      }
      final message = error.isNetwork
          ? Copy.notiNetwork
          : error.status == 404
          ? Copy.notiGone
          : Copy.notiInboxError;
      _set(
        NotificationInboxState(
          status: InboxStatus.error,
          errorMessage: message,
        ),
      );
      return;
    }
    _set(
      const NotificationInboxState(
        status: InboxStatus.error,
        errorMessage: Copy.notiInboxError,
      ),
    );
  }

  /// 당겨서 새로고침. 성공하면 목록을 교체하고 페이지를 1로 되돌린다.
  Future<void> refresh() => _reload(pull: true);

  /// 상세·피드에서 돌아올 때 첫 페이지를 조용히 다시 불러온다.
  Future<void> onResumed() => _reload(pull: false);

  Future<void> _reload({required bool pull}) async {
    if (_disposed) return;
    // 첫 로딩 중이거나 오류 화면이면 start/retry가 맡는다.
    if (_state.status == InboxStatus.loading) return;
    if (pull) _set(_copy(isRefreshing: true));
    try {
      final page = await _reloadGuard.run(() => _fetchFirst());
      // 더 새로운 새로고침이 시작됐다: 그쪽이 상태를 정리한다.
      if (_disposed || page == null) return;
      _applyFirstPage(page);
    } on Object catch (error) {
      if (_disposed) return;
      final failure = error;
      _set(_copy(isRefreshing: false));
      if (failure is ApiError) {
        if (failure.isCancelled) return;
        if (failure.status == 401) {
          _emit(const InboxLoginRequired());
          return;
        }
      }
      if (pull) _toast.show(Copy.notiInboxRefreshError);
    }
  }

  /// 화면에 새로 만들어진 마지막 항목의 index. 끝에서 4개 안이면 다음 페이지를 요청한다.
  void onVisibleIndexChanged(int lastVisibleIndex) {
    final s = _state;
    if (_disposed ||
        s.status != InboxStatus.content ||
        !s.hasNext ||
        s.isLoadingMore ||
        s.isRefreshing) {
      return;
    }
    if (lastVisibleIndex < s.items.length - 4) return;
    unawaited(_loadMore());
  }

  Future<void> _loadMore() async {
    final page = _nextPage;
    _set(_copy(isLoadingMore: true));
    try {
      final result = await _moreGuard.run(
        () => _repository.fetchPage(page: page, cancelToken: _screenToken),
      );
      // 새로고침이 목록을 교체했거나 화면이 사라졌다.
      if (_disposed || result == null) return;
      _nextPage = page + 1;
      _set(
        _copy(
          items: _dedupe(_state.items, result.items),
          hasNext: result.hasNext,
          isLoadingMore: false,
        ),
      );
    } on Object catch (error) {
      if (_disposed) return;
      _set(_copy(isLoadingMore: false));
      if (error is ApiError) {
        if (error.isCancelled) return;
        if (error.status == 401) {
          _emit(const InboxLoginRequired());
          return;
        }
      }
      _toast.show(Copy.notiInboxMoreError);
    }
  }

  Future<void> onItemTapped(String notificationId) async {
    if (_disposed || _state.processingIds.contains(notificationId)) return;
    NotificationItem? item;
    for (final candidate in _state.items) {
      if (candidate.id == notificationId) item = candidate;
    }
    if (item == null) return;
    final plan = NotificationRouter.fromInboxItem(item);
    // 이동할 수 없는 행은 오류도 읽음 요청도 아니다(REQ-NOTI-021).
    if (plan == null) return;

    _set(_copy(processingIds: {..._state.processingIds, notificationId}));
    TapResult result;
    try {
      result = await _runner.run(plan, cancelToken: _screenToken);
    } on Object {
      result = TapResult.cancelled;
    }
    if (_disposed) return;
    _set(
      _copy(processingIds: {..._state.processingIds}..remove(notificationId)),
    );
    switch (result) {
      case TapResult.navigated when plan.readNotificationId != null:
        _markRead(notificationId);
      case TapResult.loginRequired:
        _emit(const InboxLoginRequired());
      case TapResult.navigated:
      case TapResult.navigatedReadFailed:
      case TapResult.gone:
      case TapResult.cancelled:
        break;
    }
  }

  void _markRead(String id) {
    final now = clock.now().toUtc();
    _set(
      _copy(
        items: [
          for (final item in _state.items)
            item.id == id ? item.markRead(now) : item,
        ],
      ),
    );
  }

  static List<NotificationItem> _dedupe(
    List<NotificationItem> existing,
    List<NotificationItem> incoming,
  ) {
    final seen = {for (final item in existing) item.id};
    return [
      ...existing,
      for (final item in incoming)
        if (seen.add(item.id)) item,
    ];
  }

  NotificationInboxState _copy({
    List<NotificationItem>? items,
    bool? hasNext,
    bool? isRefreshing,
    bool? isLoadingMore,
    Set<String>? processingIds,
  }) {
    final s = _state;
    return NotificationInboxState(
      status: s.status,
      items: items ?? s.items,
      hasNext: hasNext ?? s.hasNext,
      isRefreshing: isRefreshing ?? s.isRefreshing,
      isLoadingMore: isLoadingMore ?? s.isLoadingMore,
      errorMessage: s.errorMessage,
      processingIds: processingIds ?? s.processingIds,
    );
  }

  void _set(NotificationInboxState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  void _emit(InboxEvent event) {
    if (!_disposed && !_events.isClosed) _events.add(event);
  }

  /// 화면 이탈: 진행 중 요청을 취소하고 이후 도착하는 응답은 버린다.
  @override
  void dispose() {
    _disposed = true;
    _screenToken.cancel();
    _reloadToken?.cancel();
    _moreGuard.invalidate();
    _reloadGuard.invalidate();
    unawaited(_events.close());
    super.dispose();
  }
}
