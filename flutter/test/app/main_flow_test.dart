import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/toast/toast_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/net_harness.dart';

Future<void> _enterMain(WidgetTester tester, AppHarness h) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  h.homeFakes.api.standard();
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  widgetTest('TC-NAV-003 인증 세션이면 /main에 하단 바와 홈이 보이고 홈 데이터를 불러온다', (
    tester,
  ) async {
    final h = AppHarness(session: sessionAt());
    await _enterMain(tester, h);
    expect(byId(HomeTestIds.root), findsOneWidget);
    expect(byId(NavigationTestIds.bottomBarRoot), findsOneWidget);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    expect(h.homeFakes.api.todayCalls, greaterThanOrEqualTo(1));
    expect(h.analytics.screenNames, contains('home'));
  });

  widgetTest('TC-NAV-014 게스트로 들어오면 인증 API 없이 홈이 열리고 기록 탭은 토스트로 막힌다', (
    tester,
  ) async {
    final h = AppHarness(session: sessionGuest());
    await _enterMain(tester, h);
    expect(byId(HomeTestIds.root), findsOneWidget);
    expect(h.homeFakes.api.authenticatedCalls, 0);
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await tester.pump();
    expect(
      find.descendant(
        of: byId(ToastTestIds.message),
        matching: find.text(Copy.navGuestRecord),
      ),
      findsOneWidget,
    );
  });
}
