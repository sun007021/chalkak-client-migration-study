import 'dart:ui' show Tristate;

import 'package:chalkak/app/app_dependencies.dart';
import 'package:chalkak/app/chalkak_app.dart';
import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/login_use_case.dart';
import 'package:chalkak/features/auth/domain/session_use_cases.dart';
import 'package:chalkak/features/auth/domain/user_data_cleaner.dart';
import 'package:chalkak/features/boot/domain/auth_gate.dart';
import 'package:chalkak/features/boot/domain/pending_navigation.dart';
import 'package:chalkak/features/boot/domain/update_gate.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_fakes.dart';
import 'fake_analytics_tracker.dart';
import 'fake_async_helpers.dart' show atFixtureNow;

/// Fake로 채운 [AppDependencies]와 그 Fake들에 접근하는 창구. 위젯 테스트용.
class AppHarness {
  AppHarness({Session? session, bool updateGateEnabled = true})
    : http = AuthHttpHarness(session: session) {
    updateGate = UpdateGate(
      checker: updateChecker,
      launcher: launcher,
      enabled: updateGateEnabled,
    );
    pendingNavigation = PendingNavigation(
      gate: updateGate,
      navigate: pushNavigations.add,
    );
    final repository = ApiAuthRepository(client: http.client);
    final cleaner = CompositeUserDataCleaner([userData, pendingNavigation]);
    dependencies = AppDependencies(
      sessions: http.sessions,
      analytics: analytics,
      updateGate: updateGate,
      authGate: AuthGate(sessions: http.sessions),
      homePreloader: preloader,
      pushRegistrar: push,
      pendingNavigation: pendingNavigation,
      userDataCleaner: cleaner,
      loginUseCase: LoginUseCase(
        socialLogin: kakao,
        nonceGenerator: FakeNonceGenerator(),
        repository: repository,
        sessions: http.sessions,
        cleaner: cleaner,
        pushRegistrar: push,
      ),
      enterGuest: EnterGuestUseCase(sessions: http.sessions),
      leaveGuest: LeaveGuestUseCase(sessions: http.sessions),
      logout: LogoutUseCase(
        sessions: http.sessions,
        repository: repository,
        cleaner: cleaner,
      ),
      withdraw: WithdrawUseCase(
        sessions: http.sessions,
        repository: repository,
        cleaner: cleaner,
      ),
    );
  }

  final AuthHttpHarness http;
  final FakeUpdateChecker updateChecker = FakeUpdateChecker();
  final FakeUpdateLauncher launcher = FakeUpdateLauncher();
  final FakeHomePreloader preloader = FakeHomePreloader();
  final FakePushRegistrar push = FakePushRegistrar();
  final FakeUserDataCleaner userData = FakeUserDataCleaner();
  final FakeSocialLoginClient kakao = FakeSocialLoginClient();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<String> pushNavigations = [];
  late final UpdateGate updateGate;
  late final PendingNavigation pendingNavigation;
  late final AppDependencies dependencies;

  Widget get app => ChalkakApp(dependencies: dependencies);
}

Finder byId(String id) => find.byKey(Key(id));

/// 앱을 띄우고 [frames]프레임(16ms)을 흘린다. 진행 표시가 계속 도는 화면이 있어
/// pumpAndSettle은 쓰지 않는다.
Future<void> pumpApp(
  WidgetTester tester,
  AppHarness h, {
  int frames = 10,
}) async {
  await tester.pumpWidget(h.app);
  await settleUi(tester, frames: frames);
}

Future<void> settleUi(WidgetTester tester, {int frames = 10}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// `Semantics.enabled` 상태. testids.md §2: 버튼은 enabled를 접근성 속성으로 노출한다.
bool isEnabled(WidgetTester tester, String id) =>
    tester
        .getSemantics(byId(id))
        .getSemanticsData()
        .flagsCollection
        .isEnabled ==
    Tristate.isTrue;

/// 위젯 테스트도 `clock.now()`를 FIXTURE_NOW로 고정해야 세션 만료 판정이 fixture와 맞는다.
void widgetTest(String name, Future<void> Function(WidgetTester tester) body) {
  testWidgets(name, (tester) => atFixtureNow(() => body(tester)));
}
