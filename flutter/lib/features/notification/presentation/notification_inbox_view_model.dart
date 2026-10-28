// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../domain/notification_models.dart';
import '../domain/notification_repository.dart';
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

  NotificationInboxState get state => throw UnimplementedError();
  Stream<InboxEvent> get events => throw UnimplementedError();

  /// 열려 있는 동안 [NotificationTapRunner]의 `refreshInbox`로 연결하는 첫 페이지 새로고침.
  Future<void> reloadFirstPage() => throw UnimplementedError();

  Future<void> start() => throw UnimplementedError();
  Future<void> retry() => throw UnimplementedError();
  Future<void> refresh() => throw UnimplementedError();
  Future<void> onResumed() => throw UnimplementedError();
  void onVisibleIndexChanged(int lastVisibleIndex) =>
      throw UnimplementedError();
  Future<void> onItemTapped(String notificationId) =>
      throw UnimplementedError();
}
