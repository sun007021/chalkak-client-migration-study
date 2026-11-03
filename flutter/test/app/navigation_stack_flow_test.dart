import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/ui/test_ids.dart';
import 'package:chalkak/features/feedback/presentation/feedback_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:chalkak/features/settings/presentation/settings_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/auth_fakes.dart' show AuthHttpHarness;
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';
import '../support/onboarding_fakes.dart' show meSignaturePath;
import '../support/settings_fakes.dart' show notificationSettingsPath;

/// 로그인·로그아웃·재인증·외부 URL 뒤의 백스택과 이동 규칙(NAV).

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

Future<AppHarness> _enterMain(
  WidgetTester tester, {
  bool loggedIn = true,
}) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final h = AppHarness(session: loggedIn ? sessionAt() : null);
  h.homeFakes.api.standard();
  h.http.adapter
    ..on('GET', meSignaturePath, [
      fx('signature/users-me-signature__get-success.json'),
    ])
    ..on('GET', notificationSettingsPath, [
      fx('settings/notification-settings__get-all-true.json'),
    ])
    ..on('POST', AuthHttpHarness.logoutPath, [
      fx('auth/logout__no-content.json'),
    ]);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  await _settle(tester, ticks: 20);
  return h;
}

Future<void> _systemBack(WidgetTester tester) async {
  await tester.binding.handlePopRoute();
  await _settle(tester, ticks: 4);
}

Future<void> _sendRouteInformation(WidgetTester tester, String uri) async {
  final message = const JSONMethodCodec().encodeMethodCall(
    MethodCall('pushRouteInformation', {'location': uri}),
  );
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    message,
    (_) {},
  );
  await _settle(tester, ticks: 4);
}

void main() {
  widgetTest('TC-NAV-039 로그인에 성공해 홈에 들어오면 뒤로 가기가 로그인 화면으로 돌아가지 않는다', (
    tester,
  ) async {
    final h = AppHarness();
    h.homeFakes.api.standard();
    h.http.onSocialLogin('auth/social-login__login-success.json');
    await tester.pumpWidget(h.app);
    h.preloader.completer.complete();
    await _settle(tester, ticks: 10);
    expect(byId(TestIds.loginRoot), findsOneWidget);
    await tester.tap(byId(TestIds.loginKakaoButton));
    await _settle(tester, ticks: 20);
    expect(byId(TestIds.homeRoot), findsOneWidget);
    expect(
      tester.state<NavigatorState>(find.byType(Navigator).first).canPop(),
      isFalse,
    );
    await _systemBack(tester);
    expect(byId(TestIds.loginRoot), findsNothing);
  });

  widgetTest('TC-NAV-041 로그아웃 뒤 로그인 화면에서 뒤로 가기를 해도 메인으로 돌아가지 못한다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabSettings));
    await _settle(tester);
    await tester.tap(byId(SettingsTestIds.logoutRow));
    await _settle(tester, ticks: 5);
    await tester.tap(byId(SettingsTestIds.logoutConfirmButton));
    await _settle(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(h.http.store.current, isNull);
    expect(
      tester.state<NavigatorState>(find.byType(Navigator).first).canPop(),
      isFalse,
    );
    await _systemBack(tester);
    expect(byId(NavigationTestIds.bottomBarRoot), findsNothing);
    expect(byId(TestIds.homeRoot), findsNothing);
    expect(byId(SettingsTestIds.root), findsNothing);
  });

  widgetTest(
    'TC-NAV-042 화면이 여러 겹 쌓인 상태에서 재인증이 필요하면 로그인으로 가고 이전 화면들이 남지 않는다',
    (tester) async {
      final h = await _enterMain(tester);
      await tester.tap(byId(NavigationTestIds.tabSettings));
      await _settle(tester);
      await tester.tap(byId(SettingsTestIds.feedbackRow));
      await _settle(tester);
      expect(byId(FeedbackTestIds.root), findsOneWidget);

      await h.http.sessions.clear(SessionClearReason.reauthenticationRequired);
      await _settle(tester);
      expect(byId(TestIds.loginRoot), findsOneWidget);
      expect(byId(FeedbackTestIds.root), findsNothing);
      expect(byId(NavigationTestIds.bottomBarRoot), findsNothing);
      expect(
        tester.state<NavigatorState>(find.byType(Navigator).first).canPop(),
        isFalse,
      );
      await _systemBack(tester);
      expect(byId(FeedbackTestIds.root), findsNothing);
      expect(byId(SettingsTestIds.root), findsNothing);
      expect(byId(TestIds.homeRoot), findsNothing);
    },
  );

  for (final uri in [
    'chalkak://post/123',
    'chalkak://notification',
    'https://chalkak.app/posts/123',
    '/terms',
  ]) {
    widgetTest('TC-NAV-045 외부 URL($uri)로 앱이 열려도 화면 이동이 일어나지 않는다', (tester) async {
      await _enterMain(tester);
      expect(byId(TestIds.homeRoot), findsOneWidget);
      await _sendRouteInformation(tester, uri);
      expect(byId(TestIds.homeRoot), findsOneWidget);
      expect(byId(NavigationTestIds.bottomBarRoot), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
    });
  }
}
