import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/test_id.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../../core/ui/toast/toast_host.dart';
import '../../display/domain/display_models.dart';
import '../../display/presentation/display_screen.dart';
import '../../display/presentation/display_view_model.dart';
import '../../feed/domain/feed_target.dart';
import '../../home/domain/home_state.dart';
import '../../home/domain/home_view_model.dart';
import '../../home/presentation/home_screen.dart';
import '../../record/domain/record_state.dart';
import '../../record/domain/record_view_model.dart';
import '../../record/presentation/record_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../domain/main_shell_view_model.dart';
import 'main_shell_navigator.dart';
import 'navigation_test_ids.dart';
import 'settings_tab.dart';

/// 토스트를 하단 바 위로 띄우는 거리(바 높이 약 85 + 여백).
const double _toastAboveBottomBar = 96;

/// 메인 화면: 탭 본문 + 하단 바(홈, 전시, 가운데 업로드, 기록, 설정).
/// - 하단 바 `bottom-bar.root`, 탭 `bottom-bar.tab-*`(선택된 탭만 selected), 업로드 버튼
///   `bottom-bar.upload-button`(selected 없음, 접근성 이름 Copy.navTabUploadA11y, 아이콘 "+").
/// - 탭 본문: 홈은 [HomeScreen](`home.root`), 전시·기록은 각 화면(ViewModel을 받지 못하면 자리표시자),
///   설정은 [SettingsScreen](`settings.root`, [settings]가 없으면 자리표시자)이며 한 번 만든 뒤 탭을 오가도
///   상태를 유지한다(REQ-NAV-005). 설정 탭이 다시 보일 때마다 `settings.viewModel.onTabShown`을 부른다
///   (처음 보일 때는 화면이 시작하며 부른다).
/// - 업로드 게이트 확인 중에는 `upload-entry.loading`을 보인다.
/// - [HomeViewModel] 이벤트를 [MainShellViewModel]/[MainShellNavigator]로 연결한다:
///   OpenUploadGate -> onUploadPressed, OpenRecordTab -> openRecord, OpenDisplayTab ->
///   openDisplay, OpenFeed/OpenBanner/OpenNotifications -> navigator(진행 중 중복 무시).
///   알림함이 닫히면 `home.refreshUnread()`.
/// - 앱이 포그라운드로 돌아오면 홈이 보이는 중일 때 `home.onForeground()`, 홈 탭으로 돌아오면
///   `home.onBecameVisible()`.
/// - [ToastHost]로 토스트를 그린다.
class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.shell,
    required this.home,
    required this.navigator,
    required this.toast,
    required this.aiCardBuilder,
    this.displayFactory,
    this.record,
    this.settings,
  });

  final MainShellViewModel shell;
  final HomeViewModel home;
  final MainShellNavigator navigator;
  final ToastController toast;
  final HomeAiCardBuilder aiCardBuilder;

  /// 전시 탭 ViewModel을 처음 열 때 만든다(홈 랭킹 더보기로 열면 그 날짜·정렬이 [DisplayTarget]).
  /// 셸이 소유하고 정리한다. null이면 전시 탭은 자리표시자다.
  final DisplayViewModel Function(DisplayTarget? target)? displayFactory;

  /// 기록 탭 ViewModel. 소유와 정리는 만든 쪽이 한다. null이면 기록 탭은 자리표시자다.
  /// 탭이 선택될 때와 이동에서 돌아올 때 `enter`, 앱 복귀 때 `onForeground`, 탭을 떠날 때 `onHidden`을 부른다.
  final RecordViewModel? record;

  /// 설정 탭. 소유와 정리는 만든 쪽이 한다. null이면 설정 탭은 자리표시자다.
  final SettingsTab? settings;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  final ScrollController _homeScroll = ScrollController();
  final Set<BottomDestination> _visited = {BottomDestination.home};
  final Set<String> _pending = {};
  StreamSubscription<HomeEvent>? _homeEvents;
  StreamSubscription<MainShellEvent>? _shellEvents;
  StreamSubscription<RecordEvent>? _recordEvents;
  late BottomDestination _selected = widget.shell.selected;
  DisplayViewModel? _display;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.shell.addListener(_onShellChanged);
    _homeEvents = widget.home.events.listen(_onHomeEvent);
    _shellEvents = widget.shell.events.listen(_onShellEvent);
    _recordEvents = widget.record?.events.listen(_onRecordEvent);
    widget.shell.start();
    unawaited(widget.home.load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.shell.removeListener(_onShellChanged);
    unawaited(_homeEvents?.cancel());
    unawaited(_shellEvents?.cancel());
    unawaited(_recordEvents?.cancel());
    _homeScroll.dispose();
    _display?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    if (widget.shell.selected == BottomDestination.home) {
      unawaited(widget.home.onForeground());
    }
    if (widget.shell.selected == BottomDestination.record) {
      unawaited(widget.record?.onForeground());
    }
    unawaited(_display?.onResumed());
  }

  void _onShellChanged() {
    final selected = widget.shell.selected;
    if (selected != _selected) {
      final leftRecord = _selected == BottomDestination.record;
      final cameToHome = selected == BottomDestination.home;
      // 이미 만들어 둔 설정 탭이 다시 보이는 경우(처음에는 화면이 시작하며 불러온다).
      final reshownSettings =
          selected == BottomDestination.settings && _visited.contains(selected);
      setState(() {
        _selected = selected;
        _visited.add(selected);
      });
      if (leftRecord) widget.record?.onHidden();
      if (selected == BottomDestination.record) _enterRecord();
      if (cameToHome) unawaited(widget.home.onBecameVisible());
      if (reshownSettings) {
        unawaited(widget.settings?.viewModel.onTabShown());
      }
      if (selected == BottomDestination.display) {
        if (_display == null) {
          _ensureDisplay();
        } else {
          _applyDisplayTarget();
        }
      }
    } else {
      setState(() {});
      // 이미 전시 탭에 있을 때의 이동(업로드 직후)도 목표를 적용한다.
      if (selected == BottomDestination.display) _applyDisplayTarget();
    }
  }

  /// 기록 탭이 열릴 때: 홈이 넘긴 날짜가 있으면 그 날짜를 고르며 들어간다.
  void _enterRecord() {
    final record = widget.record;
    if (record == null) return;
    unawaited(
      record.enter(requestedDate: widget.shell.takeRecordTarget()?.date),
    );
  }

  void _onRecordEvent(RecordEvent event) {
    switch (event) {
      case RecordOpenFeed(:final photo):
        unawaited(() async {
          await _open(
            'feed',
            () => widget.navigator.openFeedTarget(
              FeedTarget(
                postId: photo.postId,
                origin: FeedOrigin.record,
                isMine: true,
                thumbnailUrl: photo.thumbnailImageUrl,
              ),
            ),
          );
          // 돌아오면 보던 달·날짜를 유지한 채 재검증한다(REQ-REC-036).
          if (mounted && widget.shell.selected == BottomDestination.record) {
            unawaited(widget.record?.enter());
          }
        }());
      case RecordOpenDisplay(:final date):
        widget.shell.openDisplay(date: date, popular: false);
      case RecordGoToLogin():
        widget.navigator.goToLogin();
    }
  }

  /// 전시 탭이 열릴 때: 처음이면 만들고, 이미 있으면 홈이 넘긴 날짜·정렬로 옮긴다.
  void _applyDisplayTarget() {
    final display = _display;
    if (display == null) return;
    final target = widget.shell.takeDisplayTarget();
    if (target == null) return;
    unawaited(() async {
      final sameDate = display.selectedDate == target.date;
      await display.selectDate(target.date);
      await display.selectSort(
        target.popular ? DisplaySort.popular : DisplaySort.recent,
      );
      // 같은 날짜를 이미 보고 있으면 옮겨도 다시 불러오지 않으므로 직접 재검증한다.
      if (target.revalidate && sameDate) await display.onReturnedFromFeed();
    }());
  }

  DisplayViewModel? _ensureDisplay() {
    final factory = widget.displayFactory;
    if (factory == null) return null;
    final existing = _display;
    if (existing != null) return existing;
    final display = factory(widget.shell.takeDisplayTarget());
    _display = display;
    unawaited(display.load());
    return display;
  }

  Future<void> _openDisplayFeed(FeedTarget target) async {
    final display = _display;
    await _open('feed', () => widget.navigator.openFeedTarget(target));
    if (display != null && mounted) unawaited(display.onReturnedFromFeed());
  }

  void _onHomeEvent(HomeEvent event) {
    switch (event) {
      case OpenUploadGate():
        unawaited(widget.shell.onUploadPressed());
      case OpenFeed(:final post):
        unawaited(_open('feed', () => widget.navigator.openFeed(post)));
      case OpenRecordTab(:final date):
        widget.shell.openRecord(date: date);
      case OpenDisplayTab(:final date, :final popular):
        widget.shell.openDisplay(date: date, popular: popular);
      case OpenNotifications():
        unawaited(
          _open('notifications', () async {
            await widget.navigator.openNotifications();
            unawaited(widget.home.refreshUnread());
          }),
        );
      case OpenBanner(:final item):
        unawaited(_open('banner', () => widget.navigator.openBanner(item)));
    }
  }

  void _onShellEvent(MainShellEvent event) {
    switch (event) {
      case ScrollToTop(:final destination):
        if (destination == BottomDestination.home && _homeScroll.hasClients) {
          _homeScroll.jumpTo(0);
        }
        if (destination == BottomDestination.display) {
          unawaited(_display?.onTabReselected());
        }
      case NavigateToUpload(:final topicDate):
        unawaited(
          _open('upload', () => widget.navigator.openUpload(topicDate)),
        );
      case NavigateToLogin():
        widget.navigator.goToLogin();
    }
  }

  /// 같은 이동이 끝나기 전의 반복 요청(연타)은 무시한다(REQ-NAV-032).
  Future<void> _open(String name, Future<void> Function() action) async {
    if (!_pending.add(name)) return;
    try {
      await action();
    } on Object {
      // 이동 실패는 이동한 쪽 화면이 알린다. 셸은 중복 방지 표시만 풀면 된다.
    } finally {
      _pending.remove(name);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shell = widget.shell;
    return ToastHost(
      controller: widget.toast,
      bottomOffset: _toastAboveBottomBar,
      child: Scaffold(
        backgroundColor: context.tokens.colors.background,
        body: Stack(
          children: [
            IndexedStack(
              index: BottomDestination.values.indexOf(_selected),
              children: [
                for (final destination in BottomDestination.values)
                  _visited.contains(destination)
                      ? _tab(destination)
                      : const SizedBox.shrink(),
              ],
            ),
            if (shell.isCheckingUpload)
              const Positioned.fill(
                child: TestId(
                  NavigationTestIds.uploadEntryLoading,
                  child: ModalBarrier(dismissible: false),
                ),
              ),
            if (shell.isCheckingUpload)
              const Center(child: CircularProgressIndicator()),
          ],
        ),
        bottomNavigationBar: _BottomBar(
          selected: _selected,
          onTab: (destination) {
            final reselectedRecord =
                destination == BottomDestination.record &&
                destination == _selected;
            shell.selectTab(destination);
            if (reselectedRecord) _enterRecord();
          },
          onUpload: () => unawaited(shell.onUploadPressed()),
        ),
      ),
    );
  }

  Widget _tab(BottomDestination destination) => switch (destination) {
    BottomDestination.home => SafeArea(
      bottom: false,
      child: HomeScreen(
        viewModel: widget.home,
        aiCardBuilder: widget.aiCardBuilder,
        aiCardVisible:
            _selected == BottomDestination.home &&
            (ModalRoute.of(context)?.isCurrent ?? true),
        scrollController: _homeScroll,
      ),
    ),
    BottomDestination.display => switch (_display) {
      final display? => SafeArea(
        bottom: false,
        child: DisplayScreen(
          viewModel: display,
          onToast: (message) => widget.toast.show(message.text),
          onOpenFeed: (target) => unawaited(_openDisplayFeed(target)),
        ),
      ),
      null => const _TabPlaceholder('display.root'),
    },
    BottomDestination.record => switch (widget.record) {
      final record? => SafeArea(
        bottom: false,
        child: RecordScreen(viewModel: record),
      ),
      null => const _TabPlaceholder('record.root'),
    },
    BottomDestination.settings => switch (widget.settings) {
      final settings? => SafeArea(
        bottom: false,
        child: SettingsScreen(
          viewModel: settings.viewModel,
          documentViewModelFactory: settings.documentViewModelFactory,
          webViewBuilder: settings.webViewBuilder,
          onOpenFeedback: settings.onOpenFeedback,
          onChangeSignature: settings.onChangeSignature,
          onToast: widget.toast.show,
        ),
      ),
      null => const _TabPlaceholder('settings.root'),
    },
  };
}

/// 다른 PR이 실제 화면으로 바꾸기 전까지 쓰는 빈 탭.
class _TabPlaceholder extends StatelessWidget {
  const _TabPlaceholder(this.id);

  final String id;

  @override
  Widget build(BuildContext context) =>
      TestId(id, child: const SizedBox.expand());
}

/// 하단 바(screens-a §3.3 Flat / §3.6 Android). 배경 surfaceElevated, 위 15 / 아래 10 여백,
/// 아이템 최소 48x48, 아이콘 23 + 간격 7 + 라벨 footnote(선택 시 bold). 색은 선택 actionPrimary,
/// 비선택 bottomBar이고 눌러도 ripple이 없다. 가운데 작성 버튼은 `ic_bottom_write`(40 원).
/// iOS 26 Liquid Glass 렌즈는 네이티브만의 연출이라 따르지 않는다(README §1.2).
class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.selected,
    required this.onTab,
    required this.onUpload,
  });

  final BottomDestination selected;
  final void Function(BottomDestination) onTab;
  final VoidCallback onUpload;

  // ChalkakBottomBar.kt:64-72, ChalkakBottomBar.swift:425-492
  static const _iconSize = 23.0;
  static const _iconLabelGap = 7.0;
  static const _topPadding = 15.0;
  static const _bottomPadding = 10.0;
  static const _itemMinSize = 48.0;
  static const _writeSize = 40.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    return TestId(
      NavigationTestIds.bottomBarRoot,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceElevated,
          // 원본은 그림자 없이 흰 면이다. 위쪽 경계만 옅게 구분한다.
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.only(
              top: _topPadding,
              bottom: _bottomPadding,
            ),
            // 높이를 고정해 Scaffold가 주는 무제한 높이에서 Center가 화면 끝까지 늘어나지 않게 한다.
            child: SizedBox(
              height: _itemMinSize,
              child: Row(
                children: [
                  _tab(
                    context,
                    BottomDestination.home,
                    NavigationTestIds.tabHome,
                    'home',
                    Copy.navTabHome,
                  ),
                  _tab(
                    context,
                    BottomDestination.display,
                    NavigationTestIds.tabDisplay,
                    'display',
                    Copy.navTabDisplay,
                  ),
                  Expanded(
                    child: Center(
                      child: Semantics(
                        key: const Key(NavigationTestIds.uploadButton),
                        identifier: NavigationTestIds.uploadButton,
                        container: true,
                        button: true,
                        label: Copy.navTabUploadA11y,
                        onTap: onUpload,
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: onUpload,
                          child: const SizedBox(
                            width: _itemMinSize,
                            height: _itemMinSize,
                            child: Center(
                              child: ChalkakIcon(
                                ChalkakIcon.bottomWrite,
                                size: _writeSize,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  _tab(
                    context,
                    BottomDestination.record,
                    NavigationTestIds.tabRecord,
                    'record',
                    Copy.navTabRecord,
                  ),
                  _tab(
                    context,
                    BottomDestination.settings,
                    NavigationTestIds.tabSettings,
                    'setting',
                    Copy.navTabSettings,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tab(
    BuildContext context,
    BottomDestination destination,
    String id,
    String iconName,
    String label,
  ) {
    final tokens = context.tokens;
    final isSelected = destination == selected;
    final color = isSelected
        ? tokens.colors.actionPrimary
        : tokens.colors.bottomBar;
    return Expanded(
      child: TestId.button(
        id,
        child: Semantics(
          button: true,
          selected: isSelected,
          label: label,
          excludeSemantics: true,
          onTap: () => onTab(destination),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onTab(destination),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minWidth: _itemMinSize,
                minHeight: _itemMinSize,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ChalkakIcon(
                    isSelected
                        ? 'ic_bottom_${iconName}_selected'
                        : 'ic_bottom_$iconName',
                    size: _iconSize,
                    color: color,
                  ),
                  const SizedBox(height: _iconLabelGap),
                  Text(
                    label,
                    style: tokens.text.footnote.copyWith(
                      color: color,
                      fontWeight: isSelected
                          ? FontWeight.w700
                          : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
