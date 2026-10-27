import 'dart:ui' show Tristate;

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/core/ui/toast/toast_controller.dart';
import 'package:chalkak/core/ui/toast/toast_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/main_shell.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
import '../../../support/home_fakes.dart';

class _Shell {
  _Shell({bool guest = false}) : toast = ToastController() {
    rig = HomeRig(guest: guest, sink: toast);
    navigator = FakeMainNavigator();
  }
  final ToastController toast;
  late final HomeRig rig;
  late final FakeMainNavigator navigator;

  Widget get widget => MaterialApp(
    home: MainShell(
      shell: rig.shell,
      home: rig.home,
      navigator: navigator,
      toast: toast,
      aiCardBuilder: (context, postId) => const SizedBox.shrink(),
    ),
  );
}

Future<_Shell> _pump(
  WidgetTester tester, {
  bool guest = false,
  Size size = const Size(800, 6000),
  void Function(HomeApi api)? script,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final s = _Shell(guest: guest);
  script?.call(s.rig.api);
  await tester.pumpWidget(s.widget);
  await _settle(tester);
  return s;
}

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

bool? _selected(WidgetTester tester, String id) {
  final flag = tester
      .getSemantics(byId(id))
      .getSemanticsData()
      .flagsCollection
      .isSelected;
  return switch (flag) {
    Tristate.isTrue => true,
    Tristate.isFalse => false,
    _ => null,
  };
}

Finder _toastText(String text) =>
    find.descendant(of: byId(ToastTestIds.message), matching: find.text(text));

void main() {
  widgetTest('TC-NAV-001 하단 바는 홈, 전시, 업로드, 기록, 설정 순서이고 라벨은 홈/전시/기록/설정이다', (
    tester,
  ) async {
    await _pump(tester);
    expect(byId(NavigationTestIds.bottomBarRoot), findsOneWidget);
    final xs = [
      for (final id in [
        NavigationTestIds.tabHome,
        NavigationTestIds.tabDisplay,
        NavigationTestIds.uploadButton,
        NavigationTestIds.tabRecord,
        NavigationTestIds.tabSettings,
      ])
        tester.getCenter(byId(id)).dx,
    ];
    expect(xs, orderedEquals([...xs]..sort()));
    expect(xs.toSet(), hasLength(5));
    for (final label in [
      Copy.navTabHome,
      Copy.navTabDisplay,
      Copy.navTabRecord,
      Copy.navTabSettings,
    ]) {
      expect(
        find.descendant(
          of: byId(NavigationTestIds.bottomBarRoot),
          matching: find.text(label),
        ),
        findsOneWidget,
        reason: label,
      );
    }
    expect(
      tester.getSemantics(byId(NavigationTestIds.uploadButton)).label,
      contains(Copy.navTabUploadA11y),
    );
  });

  widgetTest(
    'TC-NAV-002 TC-NAV-003 처음엔 홈만 selected이고 업로드 버튼은 selected 상태가 없다',
    (tester) async {
      await _pump(tester);
      expect(byId(HomeTestIds.root), findsOneWidget);
      expect(_selected(tester, NavigationTestIds.tabHome), isTrue);
      expect(_selected(tester, NavigationTestIds.tabDisplay), isFalse);
      expect(_selected(tester, NavigationTestIds.tabRecord), isFalse);
      expect(_selected(tester, NavigationTestIds.tabSettings), isFalse);
      expect(_selected(tester, NavigationTestIds.uploadButton), isNull);
    },
  );

  widgetTest('TC-NAV-004 TC-NAV-010 전시·기록·설정 탭을 차례로 누르면 화면과 선택 표시가 따라온다', (
    tester,
  ) async {
    final s = await _pump(tester);
    for (final (tab, root, name) in [
      (NavigationTestIds.tabDisplay, 'display.root', 'display'),
      (NavigationTestIds.tabRecord, 'record.root', 'record'),
      (NavigationTestIds.tabSettings, 'settings.root', 'settings'),
    ]) {
      await tester.tap(byId(tab));
      await tester.pump(const Duration(milliseconds: 300));
      expect(byId(root), findsOneWidget, reason: name);
      expect(_selected(tester, tab), isTrue, reason: name);
      expect(
        _selected(tester, NavigationTestIds.tabHome),
        isFalse,
        reason: name,
      );
    }
    expect(s.rig.analytics.destinations, ['display', 'record', 'settings']);
    expect(s.rig.analytics.screenNames, [
      'home',
      'display',
      'record',
      'settings',
    ]);
  });

  widgetTest('TC-NAV-009 홈을 스크롤한 뒤 홈 탭을 다시 누르면 맨 위로 돌아온다', (tester) async {
    await _pump(tester, size: const Size(800, 600));
    final scrollable = find
        .descendant(
          of: byId(HomeTestIds.scroll),
          matching: find.byType(Scrollable),
        )
        .first;
    ScrollPosition position() =>
        tester.state<ScrollableState>(scrollable).position;
    position().jumpTo(position().maxScrollExtent);
    await tester.pump();
    expect(position().pixels, greaterThan(0));
    await tester.tap(byId(NavigationTestIds.tabHome));
    await tester.pump(const Duration(seconds: 1));
    expect(position().pixels, 0);
  });

  widgetTest('TC-NAV-016 게스트가 기록 탭을 누르면 탭이 바뀌지 않고 토스트가 뜨며 API는 늘지 않는다', (
    tester,
  ) async {
    final s = await _pump(tester, guest: true);
    final calls = s.rig.api.totalCalls;
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await tester.pump();
    expect(_toastText(Copy.navGuestRecord), findsOneWidget);
    expect(_selected(tester, NavigationTestIds.tabHome), isTrue);
    expect(byId('record.root'), findsNothing);
    expect(s.rig.api.totalCalls, calls);
    await tester.pump(const Duration(milliseconds: 2500));
    await tester.pump();
    expect(byId(ToastTestIds.container), findsNothing);
  });

  widgetTest('TC-NAV-017 게스트 업로드 버튼은 토스트이고 /posts/today와 업로드 이동이 없다', (
    tester,
  ) async {
    final s = await _pump(tester, guest: true);
    await tester.tap(byId(NavigationTestIds.uploadButton));
    await tester.pump();
    expect(_toastText(Copy.navGuestUpload), findsOneWidget);
    expect(s.rig.api.todayCalls, 0);
    expect(s.navigator.calls, isEmpty);
  });

  widgetTest(
    'TC-NAV-005 TC-NAV-007 업로드 버튼: 확인 중 표시, 연타해도 1회, 통과하면 업로드로 이동하고 선택 탭은 그대로다',
    (tester) async {
      final s = await _pump(
        tester,
        script: (api) => api.today([
          fx('home/posts-today__not-posted.json'),
          fx(
            'home/posts-today__not-posted.json',
            delay: const Duration(seconds: 1),
          ),
        ]),
      );
      final before = s.rig.api.todayCalls;
      await tester.tap(byId(NavigationTestIds.uploadButton));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(
        byId(NavigationTestIds.uploadButton),
        warnIfMissed: false,
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(byId(NavigationTestIds.uploadEntryLoading), findsOneWidget);
      await _settle(tester, ticks: 4);
      expect(s.rig.api.todayCalls, before + 1);
      expect(byId(NavigationTestIds.uploadEntryLoading), findsNothing);
      expect(s.navigator.count('upload'), 1);
      expect(s.navigator.uploadDates, [const KstDate(2026, 10, 27)]);
      expect(_selected(tester, NavigationTestIds.tabHome), isTrue);
    },
  );

  widgetTest('D-14 게이트가 막으면 토스트이고 업로드로 이동하지 않는다', (tester) async {
    final s = await _pump(tester);
    await tester.tap(byId(NavigationTestIds.uploadButton));
    await _settle(tester, ticks: 2);
    expect(_toastText(Copy.uploadGateAlreadyPosted), findsOneWidget);
    expect(s.navigator.calls, isEmpty);
  });

  widgetTest('TC-NAV-036 게이트 401은 로그인 화면으로 보낸다', (tester) async {
    final s = await _pump(
      tester,
      script: (api) {
        api.today([fx('home/posts-today__401-unauthorized.json')]);
        api.refreshSucceeds();
      },
    );
    s.rig.http.adapter.on('POST', '/api/v1/auth/refresh', [
      fx('auth/refresh__reauthentication-required.json'),
    ]);
    await tester.tap(byId(NavigationTestIds.uploadButton));
    await _settle(tester, ticks: 2);
    expect(s.navigator.loginCalls, 1);
  });

  widgetTest(
    'TC-HOME-048 TC-NAV-031 알림 벨을 연타해도 알림함은 하나만 열리고 닫히면 미읽음을 다시 조회한다',
    (tester) async {
      final s = await _pump(tester);
      s.navigator.hold = true;
      final unread = s.rig.api.unreadCalls;
      await tester.tap(byId(HomeTestIds.notificationButton));
      await tester.pump();
      await tester.tap(byId(HomeTestIds.notificationButton));
      await tester.pump();
      expect(s.navigator.count('notifications'), 1);
      s.navigator.completeAll();
      await _settle(tester, ticks: 2);
      expect(s.rig.api.unreadCalls, unread + 1);
      await tester.tap(byId(HomeTestIds.notificationButton));
      await tester.pump();
      expect(s.navigator.count('notifications'), 2);
    },
  );

  widgetTest('TC-NAV-020 TC-HOME-049 게스트 알림 버튼은 토스트이고 알림함이 열리지 않는다', (
    tester,
  ) async {
    final s = await _pump(tester, guest: true);
    await tester.tap(byId(HomeTestIds.notificationButton));
    await tester.pump();
    expect(_toastText(Copy.navGuestNotification), findsOneWidget);
    expect(s.navigator.calls, isEmpty);
    expect(s.rig.api.unreadCalls, 0);
  });

  widgetTest('TC-HOME-021 TC-NAV-032 랭킹 사진 탭은 피드 이동이고 연타해도 한 번만 이동한다', (
    tester,
  ) async {
    final s = await _pump(tester);
    s.navigator.hold = true;
    final id = s.rig.api.popularPostIdForTest('2026-10-27');
    await tester.tap(byId(HomeTestIds.popularItem(id)));
    await tester.pump();
    await tester.tap(byId(HomeTestIds.popularItem(id)));
    await tester.pump();
    expect(s.navigator.count('feed'), 1);
    expect(s.navigator.feedSeeds.single.id, id);
  });

  widgetTest('TC-NAV-018 게스트 랭킹 사진 탭은 토스트이고 피드로 이동하지 않는다', (tester) async {
    final s = await _pump(tester, guest: true);
    final id = s.rig.api.popularPostIdForTest('2026-10-27');
    await tester.tap(byId(HomeTestIds.popularItem(id)));
    await tester.pump();
    expect(_toastText(Copy.navGuestFeed), findsOneWidget);
    expect(s.navigator.calls, isEmpty);
    expect(s.rig.api.postDetailCalls, 0);
  });

  widgetTest('TC-BANR-025 배너 탭 연타는 한 번만 연다', (tester) async {
    final s = await _pump(tester);
    s.navigator.hold = true;
    const id = '44444444-4444-4444-8444-444444444401';
    await tester.tap(byId(HomeTestIds.issueItem(id)));
    await tester.pump();
    await tester.tap(byId(HomeTestIds.issueItem(id)));
    await tester.pump();
    expect(s.navigator.count('banner'), 1);
    expect(s.navigator.banners.single.id, id);
  });

  widgetTest('TC-HOME-031 이번 주 기록 칸/보러가기는 기록 탭을, 랭킹 더보기는 전시 탭을 연다', (
    tester,
  ) async {
    final s = await _pump(tester);
    await tester.tap(byId(HomeTestIds.weekPhoto('2026-10-26')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(byId('record.root'), findsOneWidget);
    expect(s.rig.shell.recordTarget?.date, const KstDate(2026, 10, 26));

    await tester.tap(byId(NavigationTestIds.tabHome));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(byId(HomeTestIds.rankingMoreLink));
    await tester.pump(const Duration(milliseconds: 300));
    expect(byId('display.root'), findsOneWidget);
    expect(s.rig.shell.displayTarget?.date, const KstDate(2026, 10, 26));
  });

  widgetTest('TC-HOME-039 TC-NAV-046 앱이 포그라운드로 돌아오면 홈이 조용히 다시 조회한다', (
    tester,
  ) async {
    final s = await _pump(tester);
    final today = s.rig.api.todayCalls;
    final unread = s.rig.api.unreadCalls;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settle(tester, ticks: 4);
    expect(s.rig.api.todayCalls, today + 1);
    expect(s.rig.api.unreadCalls, unread + 1);
    expect(byId(HomeTestIds.refreshIndicator), findsNothing);
  });

  widgetTest('REQ-HOME-040 다른 탭에서 홈으로 돌아오면 화면을 비우지 않고 조용히 갱신한다', (
    tester,
  ) async {
    final s = await _pump(tester);
    await tester.tap(byId(NavigationTestIds.tabDisplay));
    await tester.pump(const Duration(milliseconds: 300));
    final today = s.rig.api.todayCalls;
    await tester.tap(byId(NavigationTestIds.tabHome));
    await tester.pump(const Duration(milliseconds: 100));
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    await _settle(tester, ticks: 2);
    expect(s.rig.api.todayCalls, today + 1);
  });
}
