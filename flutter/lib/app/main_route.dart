import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/time/kst_date.dart';
import '../core/ui/toast/toast_host.dart';
import '../features/banner/domain/banner_list_controller.dart';
import '../features/banner/domain/banner_models.dart';
import '../features/banner/domain/banner_web_view_model.dart';
import '../features/banner/presentation/banner_web_screen.dart';
import '../features/home/domain/home_models.dart';
import '../features/home/domain/home_view_model.dart';
import '../features/navigation/domain/guest_guard.dart';
import '../features/navigation/domain/main_shell_view_model.dart';
import '../features/navigation/domain/upload_entry_gate.dart';
import '../features/navigation/presentation/main_shell.dart';
import '../features/navigation/presentation/main_shell_navigator.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';

/// `/main`: 세션이 게스트인지 읽은 뒤 [MainShell]을 만든다.
/// ViewModel(홈, 셸, 배너 목록)은 이 위젯이 만들고 화면이 사라질 때 함께 정리한다.
class MainRouteHost extends StatefulWidget {
  const MainRouteHost({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<MainRouteHost> createState() => _MainRouteHostState();
}

class _MainRouteHostState extends State<MainRouteHost> {
  _MainParts? _parts;
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
    setState(() => _parts = _MainParts(widget.dependencies, guest));
  }

  @override
  void dispose() {
    _disposed = true;
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
      navigator: _RouterNavigator(context, widget.dependencies),
      toast: widget.dependencies.main.toast,
      aiCardBuilder: widget.dependencies.main.aiCardBuilder,
    );
  }
}

class _MainParts {
  _MainParts(AppDependencies d, bool guest) {
    final main = d.main;
    banners = BannerListController(repository: main.bannerRepository);
    home = HomeViewModel(
      home: main.homeRepository,
      todayPost: main.todayPostRepository,
      banners: banners,
      isGuest: guest,
      toast: main.toast,
      preloadCache: main.preloadCache,
    );
    shell = MainShellViewModel(
      guard: GuestGuard(isGuest: guest, toast: main.toast),
      analytics: d.analytics,
      uploadGate: UploadEntryGate(todayPost: main.todayPostRepository),
      toast: main.toast,
    );
  }

  late final BannerListController banners;
  late final HomeViewModel home;
  late final MainShellViewModel shell;

  void dispose() {
    shell.dispose();
    home.dispose();
    banners.dispose();
  }
}

/// 셸의 이동 요청을 라우터/네비게이터로 보낸다. 알림함·피드·업로드 화면은 해당 PR이 추가하기 전까지
/// 이동하지 않고 바로 끝난다.
class _RouterNavigator implements MainShellNavigator {
  _RouterNavigator(this._context, this._dependencies);

  final BuildContext _context;
  final AppDependencies _dependencies;

  @override
  Future<void> openNotifications() => Future<void>.value();

  @override
  Future<void> openFeed(PostSummary seed) => Future<void>.value();

  @override
  Future<void> openUpload(KstDate topicDate) => Future<void>.value();

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
