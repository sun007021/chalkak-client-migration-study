import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/analytics/analytics_constants.dart';
import '../core/ui/toast/toast_host.dart';
import '../features/feed/domain/feed_target.dart';
import '../features/navigation/main_composition.dart';
import '../features/notification/domain/notification_navigator.dart';
import '../features/notification/presentation/notification_detail_screen.dart';
import '../features/notification/presentation/notification_detail_view_model.dart';
import '../features/notification/presentation/notification_inbox_screen.dart';
import '../features/notification/presentation/notification_inbox_view_model.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';

/// 알림함 라우트: [NotificationInboxViewModel]을 만들고 `start()`를 부른 뒤 [NotificationInboxScreen]을 그린다.
/// - 열려 있는 동안 `inboxReload`에 연결되어 읽음 처리 실패(404) 뒤나 다른 화면에서 돌아올 때 첫 페이지를 다시 불러온다.
/// - 앱이 포그라운드로 돌아오면 조용히 다시 불러온다.
/// - 로그인이 필요하면(401) 로그인 화면으로 간다.
class InboxRoute extends StatefulWidget {
  const InboxRoute({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<InboxRoute> createState() => _InboxRouteState();
}

class _InboxRouteState extends State<InboxRoute> with WidgetsBindingObserver {
  late final NotificationInboxViewModel _viewModel = NotificationInboxViewModel(
    repository: widget.dependencies.notification.repository,
    runner: widget.dependencies.notification.tapRunner,
    toast: widget.dependencies.main.toast,
    analytics: widget.dependencies.analytics,
  );
  StreamSubscription<InboxEvent>? _events;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final notification = widget.dependencies.notification;
    notification.inboxReload.attach(this, _viewModel.reloadFirstPage);
    _events = _viewModel.events.listen(_onEvent);
    unawaited(_viewModel.start());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.dependencies.notification.inboxReload.detach(this);
    unawaited(_events?.cancel());
    _viewModel.dispose();
    super.dispose();
  }

  void _onEvent(InboxEvent event) {
    if (!mounted) return;
    switch (event) {
      case InboxLoginRequired():
        widget.dependencies.notification.navigator.goToLogin();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_viewModel.onResumed());
  }

  @override
  Widget build(BuildContext context) {
    // 메인 셸 위에 쌓이는 라우트라 셸의 토스트가 가려진다. 같은 컨트롤러로 여기서도 그린다.
    return ToastHost(
      controller: widget.dependencies.main.toast,
      child: NotificationInboxScreen(
        viewModel: _viewModel,
        onBack: () => unawaited(Navigator.of(context).maybePop()),
      ),
    );
  }
}

/// 알림 상세 라우트(`POST_REJECTED`, `NOTICE`).
class NotificationDetailRoute extends StatefulWidget {
  const NotificationDetailRoute({
    super.key,
    required this.dependencies,
    required this.notificationId,
  });

  final AppDependencies dependencies;
  final String notificationId;

  @override
  State<NotificationDetailRoute> createState() =>
      _NotificationDetailRouteState();
}

class _NotificationDetailRouteState extends State<NotificationDetailRoute> {
  late final NotificationDetailViewModel _viewModel =
      NotificationDetailViewModel(
        notificationId: widget.notificationId,
        repository: widget.dependencies.notification.repository,
        navigator: widget.dependencies.notification.navigator,
        unread: widget.dependencies.notification.unread,
        refreshInbox: widget.dependencies.notification.inboxReload.call,
        analytics: widget.dependencies.analytics,
      );

  @override
  void initState() {
    super.initState();
    unawaited(_viewModel.start());
  }

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ToastHost(
      controller: widget.dependencies.main.toast,
      child: NotificationDetailScreen(
        viewModel: _viewModel,
        onBack: () => unawaited(Navigator.of(context).maybePop()),
      ),
    );
  }
}

/// 알림·푸시 처리가 요청하는 이동을 실제 [Navigator]에 옮긴다(`MainRouteHost`가 만든다).
///
/// 규칙(D-11):
/// - 열려 있는 팝업(다이얼로그, 시트)은 먼저 닫는다. 이동이 팝업 위에 쌓이지 않게 한다.
/// - 홈: 메인 위의 화면을 모두 닫고 홈 탭을 고른다. 이미 홈이면 더 쌓지 않는다(TC-PUSH-065).
/// - 알림함: 이미 스택에 있으면 그 위의 화면만 닫는다.
/// - 같은 게시물·같은 알림 상세가 맨 위에 있으면 새로 쌓지 않고 교체한다(TC-PUSH-064).
/// - 이동 요청은 화면을 연 직후 끝난다(화면이 닫힐 때까지 기다리지 않는다). 탭 처리기가 읽음 표시와 미읽음 갱신을
///   바로 이어 할 수 있어야 한다.
class RouterNotificationNavigator implements NotificationNavigator {
  RouterNotificationNavigator({
    required this.context,
    required this.dependencies,
    required this.parts,
    required this.feedRouteBuilder,
  });

  final BuildContext context;
  final AppDependencies dependencies;

  /// 메인 화면이 만든 ViewModel 묶음. 아직 없으면 null.
  final MainComposition? Function() parts;

  /// 게시물 상세 라우트를 만든다(세션에서 userId를 읽는다). 만들 수 없으면 null.
  final Future<PageRoute<void>?> Function(
    FeedTarget target, {
    required bool openAiFeedback,
  })
  feedRouteBuilder;

  /// 스택에 있는 알림함 라우트.
  PageRoute<void>? _inbox;

  NavigatorState? get _navigator =>
      context.mounted ? Navigator.of(context) : null;

  /// 메인 셸 위에 쌓이는 화면의 이름. 맨 위 라우트가 같은 대상인지 알아보는 데 쓴다.
  static String feedName(String postId) => 'feed:$postId';
  static String detailName(String id) => 'notification-detail:$id';
  static const String inboxName = 'notifications';

  PageRoute<void> _inboxRoute() => MaterialPageRoute<void>(
    settings: const RouteSettings(name: inboxName),
    builder: (_) => InboxRoute(dependencies: dependencies),
  );

  /// 홈 탭의 알림 벨이 부른다. 알림함이 닫힐 때 끝난다.
  Future<void> openInboxAndWait() async {
    await openInbox();
    final inbox = _inbox;
    if (inbox != null) await inbox.completed;
  }

  @override
  Future<void> openHome({required bool scrollToTopAndRefresh}) async {
    final navigator = _navigator;
    if (navigator == null) return;
    navigator.popUntil((route) => route.isFirst);
    final composition = parts();
    if (composition == null) return;
    // 홈이 이미 선택돼 있어도 같은 탭 재선택이 맨 위로 스크롤한다.
    composition.shell.selectTab(BottomDestination.home);
    if (scrollToTopAndRefresh) unawaited(composition.home.refresh());
  }

  @override
  Future<void> openInbox() async {
    final navigator = _navigator;
    if (navigator == null) return;
    final existing = _inbox;
    if (existing != null && existing.isActive) {
      navigator.popUntil((route) => route == existing);
      return;
    }
    navigator.popUntil((route) => route is PageRoute);
    _pushInbox(navigator);
  }

  void _pushInbox(NavigatorState navigator, {bool replace = false}) {
    final route = _inboxRoute();
    _inbox = route;
    unawaited(
      route.completed.then<void>((_) {
        if (identical(_inbox, route)) _inbox = null;
      }),
    );
    unawaited(
      replace ? navigator.pushReplacement(route) : navigator.push(route),
    );
  }

  @override
  Future<void> openFeed(
    FeedTarget target, {
    required bool openAiFeedback,
  }) async {
    final navigator = _navigator;
    if (navigator == null) return;
    final route = await feedRouteBuilder(
      target,
      openAiFeedback: openAiFeedback,
    );
    if (route == null || !context.mounted) return;
    _openAbove(navigator, route, name: feedName(target.postId));
  }

  @override
  Future<void> openNotificationDetail(String notificationId) async {
    final navigator = _navigator;
    if (navigator == null) return;
    final route = MaterialPageRoute<void>(
      settings: RouteSettings(name: detailName(notificationId)),
      builder: (_) => NotificationDetailRoute(
        dependencies: dependencies,
        notificationId: notificationId,
      ),
    );
    _openAbove(navigator, route, name: detailName(notificationId));
  }

  /// 팝업을 닫고, 맨 위가 같은 대상이면 교체하고 아니면 쌓는다. 닫히면 알림함을 조용히 갱신한다.
  void _openAbove(
    NavigatorState navigator,
    PageRoute<void> route, {
    required String name,
  }) {
    navigator.popUntil((route) => route is PageRoute);
    Route<dynamic>? top;
    navigator.popUntil((route) {
      top = route;
      return true;
    });
    unawaited(route.completed.then<void>((_) => _onReturned()));
    if (top?.settings.name == name) {
      unawaited(navigator.pushReplacement(route));
    } else {
      unawaited(navigator.push(route));
    }
  }

  /// 상세·피드에서 돌아오면 아래에 알림함이 있을 때 읽음 상태를 맞춘다(REQ-NOTI-012).
  void _onReturned() {
    final inbox = _inbox;
    if (inbox == null || !inbox.isActive) return;
    unawaited(dependencies.notification.inboxReload.call());
  }

  @override
  Future<void> backToInbox() async {
    final navigator = _navigator;
    if (navigator == null) return;
    final existing = _inbox;
    if (existing != null && existing.isActive) {
      navigator.popUntil((route) => route == existing);
      return;
    }
    // 알림함이 아래에 없다(푸시로 상세에 바로 왔다): 상세를 알림함으로 바꾼다.
    navigator.popUntil((route) => route is PageRoute);
    _pushInbox(navigator, replace: true);
  }

  @override
  void goToLogin() {
    if (context.mounted) context.go(AppRoutes.login);
  }
}
