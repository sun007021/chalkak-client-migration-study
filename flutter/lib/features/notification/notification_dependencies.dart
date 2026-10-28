import 'dart:async';

import '../../core/auth/session_manager.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../feed/domain/feed_target.dart';
import 'data/push_platform.dart';
import 'domain/notification_navigator.dart';
import 'domain/notification_permission_prompt.dart';
import 'domain/notification_repository.dart';
import 'domain/notification_tap_runner.dart';
import 'domain/pending_push_store.dart';
import 'domain/push_bootstrap.dart';
import 'domain/push_device_registrar.dart';
import 'domain/push_device_repository.dart';
import 'domain/push_foreground_handler.dart';
import 'domain/push_tap_coordinator.dart';
import 'domain/session_refresher.dart';
import 'domain/unread_refresher.dart';

/// 나중에 연결되는 호출 대상. 앱이 사는 동안 있는 객체(탭 처리기, 등록기)가 화면이 만드는 ViewModel을 부를 때 쓴다.
/// [attach]한 소유자만 [detach]할 수 있어 늦게 닫히는 화면이 새 화면의 연결을 끊지 못한다.
class AttachedCallback {
  Object? _owner;
  Future<void> Function()? _callback;

  bool get isAttached => _callback != null;

  void attach(Object owner, Future<void> Function() callback) {
    _owner = owner;
    _callback = callback;
  }

  void detach(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _callback = null;
  }

  Future<void> call() async => _callback?.call();
}

/// 홈 ViewModel의 `refreshUnread`를 [UnreadRefresher]로 보여 준다. 홈이 없으면 아무것도 하지 않는다.
class HomeUnreadRefresher implements UnreadRefresher {
  final AttachedCallback _target = AttachedCallback();

  void attach(Object owner, Future<void> Function() refreshUnread) =>
      _target.attach(owner, refreshUnread);

  void detach(Object owner) => _target.detach(owner);

  @override
  Future<void> refreshUnread() => _target.call();
}

/// 라우터가 만든 [NotificationNavigator]에 위임한다. 메인 화면이 없을 때(로그인 화면, 시작 중)는
/// 이동하지 않는다. 탭 처리기는 메인이 준비된 뒤에만 이동을 시작한다.
class AttachedNotificationNavigator implements NotificationNavigator {
  Object? _owner;
  NotificationNavigator? _target;

  void attach(Object owner, NotificationNavigator target) {
    _owner = owner;
    _target = target;
  }

  void detach(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _target = null;
  }

  @override
  Future<void> openHome({required bool scrollToTopAndRefresh}) async =>
      _target?.openHome(scrollToTopAndRefresh: scrollToTopAndRefresh);

  @override
  Future<void> openInbox() async => _target?.openInbox();

  @override
  Future<void> openFeed(
    FeedTarget target, {
    required bool openAiFeedback,
  }) async => _target?.openFeed(target, openAiFeedback: openAiFeedback);

  @override
  Future<void> openNotificationDetail(String notificationId) async =>
      _target?.openNotificationDetail(notificationId);

  @override
  Future<void> backToInbox() async => _target?.backToInbox();

  @override
  void goToLogin() => _target?.goToLogin();
}

/// 알림·푸시가 앱 전체에서 쓰는 객체 묶음(`AppDependencies.notification`).
class NotificationDependencies {
  const NotificationDependencies({
    required this.repository,
    required this.platform,
    required this.registrar,
    required this.tapRunner,
    required this.coordinator,
    required this.permissionPrompt,
    required this.bootstrap,
    required this.navigator,
    required this.unread,
    required this.inboxReload,
  });

  final NotificationRepository repository;
  final PushPlatform platform;
  final PushDeviceRegistrar registrar;
  final NotificationTapRunner tapRunner;
  final PushTapCoordinator coordinator;
  final NotificationPermissionPrompt permissionPrompt;
  final PushBootstrap bootstrap;

  /// 메인 화면이 [AttachedNotificationNavigator.attach]로 연결한다.
  final AttachedNotificationNavigator navigator;

  /// 메인 화면이 홈 ViewModel을 연결한다.
  final HomeUnreadRefresher unread;

  /// 열려 있는 알림함의 첫 페이지 새로고침. 알림함 화면이 연결한다.
  final AttachedCallback inboxReload;

  /// 앱 시작 때 한 번: 보류분을 복원하고 푸시 스트림을 잇는다.
  /// 먼저 복원해야 시작 메시지(콜드 스타트 탭)가 보류분을 지우지 않는다.
  Future<void> start() async {
    try {
      await coordinator.restore();
    } on Object {
      // 복원 실패가 푸시 수신 연결을 막지 않는다.
    }
    await bootstrap.start();
  }

  Future<void> dispose() => bootstrap.dispose();

  /// 인증 사용자의 메인 첫 진입 직후. 푸시를 쓸 수 없는 구성이면 OS 권한을 묻지도 표시를 남기지도 않는다.
  Future<void> onMainEntered({required bool isGuest}) async {
    await platform.ready;
    if (!platform.isAvailable) return;
    await permissionPrompt.onMainEntered(isGuest: isGuest);
  }

  /// 앱 시작·포그라운드 복귀 때. 실패는 무시한다.
  void registerDevice() {
    unawaited(registrar.registerCurrentDevice().catchError((Object _) {}));
  }
}

/// 구현체를 받아 [NotificationDependencies]를 조립한다. 앱은 실제 구현, 위젯 테스트는 Fake를 넣는다.
NotificationDependencies buildNotificationDependencies({
  required NotificationRepository repository,
  required PushDeviceRepository devices,
  required SessionManager sessions,
  required SessionRefresher refresher,
  required PushPlatform platform,
  required PendingPushStore pendingStore,
  required PermissionPromptFlag promptFlag,
  required ToastSink toast,
}) {
  final navigator = AttachedNotificationNavigator();
  final unread = HomeUnreadRefresher();
  final inboxReload = AttachedCallback();
  final tapRunner = NotificationTapRunner(
    repository: repository,
    navigator: navigator,
    toast: toast,
    unread: unread,
    refreshInbox: inboxReload.call,
  );
  final coordinator = PushTapCoordinator(
    sessions: sessions,
    store: pendingStore,
    runner: tapRunner,
    navigator: navigator,
  );
  final registrar = PushDeviceRegistrar(
    tokens: platform.tokens,
    devices: devices,
    sessions: sessions,
    refresher: refresher,
  );
  final foreground = PushForegroundHandler(
    permission: platform.permission,
    presenter: platform.presenter,
    unread: unread,
    showsLocalNotification: platform.showsLocalNotification,
  );
  return NotificationDependencies(
    repository: repository,
    platform: platform,
    registrar: registrar,
    tapRunner: tapRunner,
    coordinator: coordinator,
    permissionPrompt: NotificationPermissionPrompt(
      permission: platform.permission,
      flag: promptFlag,
      toast: toast,
    ),
    bootstrap: PushBootstrap(
      messages: platform.messages,
      tokens: platform.tokens,
      registrar: registrar,
      coordinator: coordinator,
      foreground: foreground,
    ),
    navigator: navigator,
    unread: unread,
    inboxReload: inboxReload,
  );
}
