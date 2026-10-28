import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/time/kst_date.dart';
import '../core/ui/toast/toast_host.dart';
import '../features/banner/domain/banner_models.dart';
import '../features/banner/domain/banner_web_view_model.dart';
import '../features/banner/presentation/banner_web_screen.dart';
import '../features/feed/domain/feed_target.dart';
import '../features/home/domain/home_models.dart';
import '../features/like/domain/toast_message.dart' as like;
import '../features/navigation/main_composition.dart';
import '../features/navigation/presentation/main_shell.dart';
import '../features/navigation/presentation/main_shell_navigator.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';
import 'feed_route.dart';
import 'upload_route.dart';

/// `/main`: 세션이 게스트인지 읽은 뒤 [MainShell]을 만든다.
/// ViewModel(홈, 셸, 배너 목록)은 이 위젯이 만들고 화면이 사라질 때 함께 정리한다.
class MainRouteHost extends StatefulWidget {
  const MainRouteHost({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<MainRouteHost> createState() => _MainRouteHostState();
}

class _MainRouteHostState extends State<MainRouteHost> {
  MainComposition? _parts;
  late final _RouterNavigator _navigator = _RouterNavigator(
    context,
    widget.dependencies,
    onUploaded: _onUploaded,
  );
  StreamSubscription<like.ToastMessage>? _likeToasts;
  bool _disposed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    bool guest;
    try {
      guest = (await widget.dependencies.sessions.read())?.isGuest ?? false;
    } on Object {
      guest = false;
    }
    if (_disposed || !mounted) return;
    // 좋아요 실패·게스트 토스트는 여기서 한 번만 구독해 메인 토스트로 보낸다. 컨트롤러가 자기 id를 매기므로
    // 저장소 쪽 id와 겹치지 않고, 같은 문구가 연달아 나가도 둘 다 표시된다(D-20).
    final main = widget.dependencies.main;
    unawaited(_likeToasts?.cancel());
    _likeToasts = main.likeStore.toasts.listen(
      (message) => main.toast.show(message.text),
    );
    setState(
      () => _parts = MainComposition.create(
        dependencies: widget.dependencies.main,
        analytics: widget.dependencies.analytics,
        isGuest: guest,
      ),
    );
  }

  /// 업로드 성공 뒤: 전시 탭의 해당 날짜로 가고, 홈은 오늘 사진 상태를, 기록은 달력을 다시 불러온다
  /// (REQ-UPL-063). 홈은 `refresh`, 기록은 `enter`를 쓴다.
  void _onUploaded(KstDate date) {
    final parts = _parts;
    if (_disposed || parts == null) return;
    parts.shell.openDisplay(date: date, popular: false, revalidate: true);
    unawaited(parts.home.refresh());
    unawaited(parts.record.enter());
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_likeToasts?.cancel());
    _parts?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final parts = _parts;
    if (parts == null) return const Scaffold(body: SizedBox.shrink());
    return MainShell(
      shell: parts.shell,
      home: parts.home,
      record: parts.record,
      navigator: _navigator,
      toast: widget.dependencies.main.toast,
      aiCardBuilder: widget.dependencies.main.aiCardBuilder,
      displayFactory: (target) => MainComposition.createDisplay(
        dependencies: widget.dependencies.main,
        target: target,
      ),
    );
  }
}

/// 셸의 이동 요청을 라우터/네비게이터로 보낸다. 알림함은 해당 PR이 추가하기 전까지
/// 이동하지 않고 바로 끝난다.
class _RouterNavigator implements MainShellNavigator {
  _RouterNavigator(
    this._context,
    this._dependencies, {
    required this.onUploaded,
  });

  final BuildContext _context;
  final AppDependencies _dependencies;

  /// 업로드를 마치고 "확인했어요."를 누르면 전시 탭 이동과 재검증을 맡는다.
  final void Function(KstDate date) onUploaded;

  @override
  Future<void> openNotifications() => Future<void>.value();

  @override
  Future<void> openFeed(PostSummary seed) => openFeedTarget(
    FeedTarget(
      postId: seed.id,
      origin: FeedOrigin.home,
      isMine: seed.isMine,
      thumbnailUrl: seed.thumbnailImageUrl,
    ),
  );

  @override
  Future<void> openFeedTarget(FeedTarget target) async {
    if (!_context.mounted) return;
    String? userId;
    try {
      final session = await _dependencies.sessions.read();
      if (session != null && !session.isGuest && session.userId.isNotEmpty) {
        userId = session.userId;
      }
    } on Object {
      userId = null;
    }
    if (!_context.mounted) return;
    await Navigator.of(_context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => FeedRoute(
          dependencies: _dependencies,
          target: target,
          userId: userId,
        ),
      ),
    );
  }

  @override
  Future<void> openUpload(KstDate topicDate) async {
    if (!_context.mounted || _dependencies.main.upload == null) return;
    UploadExit? exit;
    await Navigator.of(_context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (context) => UploadRoute(
          dependencies: _dependencies,
          topicDate: topicDate,
          onExit: (value) => exit = value,
        ),
      ),
    );
    switch (exit) {
      case UploadExitToDisplay(:final date):
        onUploaded(date);
      case UploadExitToLogin():
        goToLogin();
      case null:
        break;
    }
  }

  @override
  Future<void> openBanner(BannerItem item) async {
    if (!_context.mounted) return;
    await Navigator.of(_context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) =>
            _BannerRoute(dependencies: _dependencies, item: item),
      ),
    );
  }

  @override
  void goToLogin() {
    if (_context.mounted) _context.go(AppRoutes.login);
  }
}

class _BannerRoute extends StatefulWidget {
  const _BannerRoute({required this.dependencies, required this.item});

  final AppDependencies dependencies;
  final BannerItem item;

  @override
  State<_BannerRoute> createState() => _BannerRouteState();
}

class _BannerRouteState extends State<_BannerRoute> {
  late final BannerWebViewModel _viewModel = BannerWebViewModel(
    url: widget.item.webViewUrl,
    analytics: widget.dependencies.analytics,
    toast: widget.dependencies.main.toast,
    launcher: widget.dependencies.main.externalLinks,
  );

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  // 배너 화면은 메인 셸 위에 쌓이는 라우트라 셸의 토스트가 가려진다. 같은 컨트롤러로 여기서도 그린다.
  Widget build(BuildContext context) => ToastHost(
    controller: widget.dependencies.main.toast,
    child: BannerWebScreen(
      viewModel: _viewModel,
      webViewBuilder: widget.dependencies.main.bannerWebViewBuilder,
      onBack: () => Navigator.of(context).maybePop(),
    ),
  );
}
