import 'package:chalkak/core/ui/toast/toast_controller.dart';
import 'package:chalkak/core/ui/toast/toast_host.dart';
import 'package:chalkak/core/ui/toast/toast_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId;

void main() {
  Future<ToastController> pumpHost(WidgetTester tester) async {
    final controller = ToastController();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ToastHost(
            controller: controller,
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
    return controller;
  }

  testWidgets('TC-NAV-025 토스트 컨테이너와 문구는 떠 있는 동안에만 트리에 있고 2.5초 뒤 사라진다', (
    tester,
  ) async {
    final controller = await pumpHost(tester);
    expect(byId(ToastTestIds.container), findsNothing);

    controller.show('기록을 보려면 로그인이 필요해요');
    await tester.pump();
    expect(byId(ToastTestIds.container), findsOneWidget);
    expect(
      find.descendant(
        of: byId(ToastTestIds.message),
        matching: find.text('기록을 보려면 로그인이 필요해요'),
      ),
      findsOneWidget,
    );

    await tester.pump(const Duration(milliseconds: 2499));
    expect(byId(ToastTestIds.container), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(byId(ToastTestIds.container), findsNothing);
  });

  testWidgets('TC-NAV-026 같은 문구가 연달아 요청돼도 두 번째 토스트가 다시 그려진다', (tester) async {
    final controller = await pumpHost(tester);
    controller.show('같은 문구');
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    controller.show('같은 문구');
    await tester.pump();
    // 첫 토스트였다면 이미 사라졌을 시점(2.5초 경과)에도 두 번째는 보인다.
    await tester.pump(const Duration(milliseconds: 1000));
    expect(byId(ToastTestIds.message), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pump();
    expect(byId(ToastTestIds.message), findsNothing);
  });

  testWidgets('TC-NAV-028 앱이 백그라운드로 가 있는 동안의 토스트 요청은 표시하지 않는다', (tester) async {
    final controller = await pumpHost(tester);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(controller.screenVisible, isFalse);
    controller.show('백그라운드 요청');
    await tester.pump();
    expect(byId(ToastTestIds.container), findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(controller.screenVisible, isTrue);
    expect(byId(ToastTestIds.container), findsNothing);
  });
}
