import 'dart:async';

import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/test_ids.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/net_harness.dart';

void main() {
  widgetTest('TC-BOOT-001 세션이 없으면 스플래시 뒤 로그인 화면이 열리고 홈은 한 번도 그려지지 않는다', (
    tester,
  ) async {
    final h = AppHarness();
    await tester.pumpWidget(h.app);
    expect(byId(TestIds.splashLogo), findsOneWidget, reason: '첫 프레임은 스플래시');
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(byId(TestIds.homeRoot), findsNothing, reason: '프레임 $i');
    }
    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(byId(TestIds.splashLogo), findsNothing);
    expect(h.preloader.count, 0);
  });

  widgetTest('TC-BOOT-002 인증 세션이면 로그인 화면을 거치지 않고 홈이 열린다', (tester) async {
    final h = AppHarness(session: sessionAt());
    await tester.pumpWidget(h.app);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(byId(TestIds.loginRoot), findsNothing);
    }
    h.preloader.completer.complete();
    await settleUi(tester);
    expect(byId(TestIds.homeRoot), findsOneWidget);
    expect(byId(TestIds.loginRoot), findsNothing);
  });

  widgetTest('TC-BOOT-003 게스트 세션이면 홈이 열린다', (tester) async {
    final h = AppHarness(session: sessionGuest());
    await tester.pumpWidget(h.app);
    h.preloader.completer.complete();
    await settleUi(tester);
    expect(byId(TestIds.homeRoot), findsOneWidget);
    expect(h.preloader.calls, [true]);
  });

  widgetTest('TC-BOOT-011 프리로드가 안 끝나도 700ms에 스플래시가 해제된다', (tester) async {
    final h = AppHarness(session: sessionAt());
    await tester.pumpWidget(h.app);
    await tester.pump(const Duration(milliseconds: 600));
    expect(byId(TestIds.splashLogo), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 150));
    await settleUi(tester, frames: 3);
    expect(byId(TestIds.splashLogo), findsNothing);
    expect(byId(TestIds.homeRoot), findsOneWidget);
  });

  widgetTest('TC-BOOT-015 세션을 읽는 동안에는 로그인 화면이 번쩍이지 않고 스플래시가 유지된다', (
    tester,
  ) async {
    final h = AppHarness();
    final gate = Completer<UpdateStatus>();
    h.updateChecker.next = () => gate.future;
    await tester.pumpWidget(h.app);
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(byId(TestIds.splashLogo), findsOneWidget);
      expect(byId(TestIds.loginRoot), findsNothing);
      expect(byId(TestIds.homeRoot), findsNothing);
    }
    gate.complete(UpdateStatus.upToDate);
    await settleUi(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
  });

  group('강제 업데이트 다이얼로그', () {
    widgetTest('TC-BOOT-016 TC-BOOT-028 문구·버튼 하나, 홈·로그인 접근 불가', (tester) async {
      final h = AppHarness(session: sessionAt());
      h.updateChecker.next = () => UpdateStatus.updateRequired;
      await pumpApp(tester, h);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
      expect(
        find.descendant(
          of: byId(TestIds.updateGateTitle),
          matching: find.text(Copy.bootUpdateTitle),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: byId(TestIds.updateGateMessage),
          matching: find.text(Copy.bootUpdateBody),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: byId(TestIds.updateGateUpdateButton),
          matching: find.text(Copy.bootUpdateButton),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: byId(TestIds.updateGateDialog),
          matching: find.byType(ButtonStyleButton),
        ),
        findsOneWidget,
      );
      expect(byId(TestIds.homeRoot), findsNothing);
      expect(byId(TestIds.loginRoot), findsNothing);
      expect(h.preloader.count, 0);
      expect(h.push.calls, 0);
    });

    widgetTest('TC-BOOT-028 뒤로가기·바깥 탭으로 닫히지 않는다', (tester) async {
      final h = AppHarness();
      h.updateChecker.next = () => UpdateStatus.updateRequired;
      await pumpApp(tester, h);
      await tester.binding.handlePopRoute();
      await settleUi(tester, frames: 3);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
      await tester.tapAt(const Offset(2, 2));
      await settleUi(tester, frames: 3);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
      await tester.fling(
        byId(TestIds.updateGateDialog),
        const Offset(0, 600),
        2000,
      );
      await settleUi(tester, frames: 3);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
      expect(byId(TestIds.loginRoot), findsNothing);
    });

    widgetTest('TC-BOOT-029 "업데이트"를 연타해도 스토어 열기는 1회다', (tester) async {
      final h = AppHarness();
      h.updateChecker.next = () => UpdateStatus.updateRequired;
      h.launcher.gate = Completer<void>();
      await pumpApp(tester, h);
      for (var i = 0; i < 3; i++) {
        await tester.tap(byId(TestIds.updateGateUpdateButton));
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(h.launcher.calls, 1);
      h.launcher.gate!.complete();
      await settleUi(tester, frames: 3);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
    });

    widgetTest('TC-BOOT-034 강제 업데이트는 인증 세션이 유효해도 홈보다 먼저다', (tester) async {
      final h = AppHarness(session: sessionAt());
      h.updateChecker.next = () => UpdateStatus.updateRequired;
      await pumpApp(tester, h, frames: 60);
      expect(byId(TestIds.updateGateDialog), findsOneWidget);
      expect(byId(TestIds.homeRoot), findsNothing);
    });

    widgetTest('TC-BOOT-032 게이트를 끄면 다이얼로그 없이 진행한다', (tester) async {
      final h = AppHarness(updateGateEnabled: false);
      h.updateChecker.next = () => UpdateStatus.updateRequired;
      await pumpApp(tester, h);
      expect(byId(TestIds.updateGateDialog), findsNothing);
      expect(byId(TestIds.loginRoot), findsOneWidget);
      expect(h.updateChecker.calls, 0);
    });
  });

  widgetTest('TC-BOOT-021 로그인 화면이 보일 때 screen_view(login)을 한 번 보낸다', (
    tester,
  ) async {
    final h = AppHarness();
    await pumpApp(tester, h);
    expect(h.analytics.screenNames, ['login']);
  });

  widgetTest('TC-AUTH-056 재인증이 필요하면 홈에서 로그인으로 가고 뒤로가기로 돌아올 수 없다', (
    tester,
  ) async {
    final h = AppHarness(session: sessionAt());
    await tester.pumpWidget(h.app);
    h.preloader.completer.complete();
    await settleUi(tester);
    expect(byId(TestIds.homeRoot), findsOneWidget);

    await h.http.sessions.clear(SessionClearReason.reauthenticationRequired);
    await settleUi(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(byId(TestIds.homeRoot), findsNothing);
    expect(
      tester.state<NavigatorState>(find.byType(Navigator).first).canPop(),
      isFalse,
    );
    await tester.binding.handlePopRoute();
    await settleUi(tester, frames: 3);
    expect(byId(TestIds.homeRoot), findsNothing);
  });
}
