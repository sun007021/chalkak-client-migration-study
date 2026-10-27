import 'dart:ui' show CheckedState, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_async_helpers.dart' show atFixtureNow;

/// 위젯 테스트 공용 보조. `app_harness.dart`·`onboarding_fakes.dart`가 다시 내보낸다.

Finder byId(String id) => find.byKey(Key(id));

/// `clock.now()`를 FIXTURE_NOW로 고정한 위젯 테스트. 세션 만료 판정이 fixture와 맞아야 한다.
void widgetTest(String name, Future<void> Function(WidgetTester tester) body) {
  testWidgets(name, (tester) => atFixtureNow(() => body(tester)));
}

/// 화면 하나를 단독으로 띄운다. 진행 표시가 계속 도는 화면이 있어 pumpAndSettle은 쓰지 않는다.
Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
  await tester.pumpWidget(MaterialApp(home: screen));
  await settleUi(tester);
}

Future<void> settleUi(WidgetTester tester, {int frames = 10}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// testids.md §2: 버튼은 enabled를 접근성 속성으로 노출한다.
bool isEnabled(WidgetTester tester, String id) =>
    tester
        .getSemantics(byId(id))
        .getSemanticsData()
        .flagsCollection
        .isEnabled ==
    Tristate.isTrue;

/// testids.md §2: 체크는 checked를 접근성 속성으로 노출한다.
bool isChecked(WidgetTester tester, String id) =>
    tester
        .getSemantics(byId(id))
        .getSemanticsData()
        .flagsCollection
        .isChecked ==
    CheckedState.isTrue;
