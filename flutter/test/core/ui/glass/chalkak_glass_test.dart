import 'package:chalkak/core/ui/components/chalkak_nav_button.dart';
import 'package:chalkak/core/ui/glass/chalkak_glass.dart';
import 'package:chalkak/core/ui/toast/toast_controller.dart';
import 'package:chalkak/features/navigation/presentation/main_shell.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
import '../../../support/home_fakes.dart';

Future<void> _pumpShell(WidgetTester tester, {required bool glass}) async {
  tester.view.physicalSize = const Size(400, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final toast = ToastController();
  final rig = HomeRig(guest: false, sink: toast);
  await tester.pumpWidget(
    ChalkakGlassScope(
      usesGlass: glass,
      child: MaterialApp(
        home: MainShell(
          shell: rig.shell,
          home: rig.home,
          navigator: FakeMainNavigator(),
          toast: toast,
          aiCardBuilder: (
            context,
            postId, {
            required topicDate,
            required visible,
          }) => const SizedBox.shrink(),
        ),
      ),
    ),
  );
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

void main() {
  group('usesGlass 판단', () {
    test('iOS 26 이상이고 투명도 줄이기가 꺼져 있을 때만 true', () {
      bool f(TargetPlatform p, int? v, {bool reduce = false}) =>
          resolveUsesGlass(
            platform: p,
            iosMajorVersion: v,
            reduceTransparency: reduce,
          );
      expect(f(TargetPlatform.iOS, 26), isTrue);
      expect(f(TargetPlatform.iOS, 27), isTrue);
      expect(f(TargetPlatform.iOS, 25), isFalse);
      expect(f(TargetPlatform.iOS, null), isFalse);
      expect(f(TargetPlatform.iOS, 26, reduce: true), isFalse);
      expect(f(TargetPlatform.android, 26), isFalse);
    });

    test('운영체제 버전 문자열에서 주 버전을 읽는다', () {
      expect(parseIosMajorVersion('Version 26.0.1 (Build 23A355)'), 26);
      expect(parseIosMajorVersion('Version 18.4 (Build 22E240)'), 18);
      expect(parseIosMajorVersion('unknown'), isNull);
    });
  });

  group('하단 바 재질', () {
    widgetTest('유리: 떠 있는 블러 캡슐과 선택 렌즈, 바 뒤는 투명', (tester) async {
      await _pumpShell(tester, glass: true);
      expect(find.byKey(const Key('bottom-bar-glass')), findsOneWidget);
      expect(find.byKey(const Key('bottom-bar-lens')), findsOneWidget);
      expect(
        find.descendant(
          of: byId(NavigationTestIds.bottomBarRoot),
          matching: find.byType(BackdropFilter),
        ),
        findsOneWidget,
      );
      expect(tester.widget<Scaffold>(find.byType(Scaffold)).extendBody, isTrue);
      // 좌우 여백 lg+xs = 20
      final rect = tester.getRect(find.byKey(const Key('bottom-bar-glass')));
      expect(rect.left, 20);
      expect(rect.right, 380);
    });

    widgetTest('평면: 화면 폭 바, 블러 없음', (tester) async {
      await _pumpShell(tester, glass: false);
      expect(find.byKey(const Key('bottom-bar-glass')), findsNothing);
      expect(find.byKey(const Key('bottom-bar-lens')), findsNothing);
      expect(find.byType(BackdropFilter), findsNothing);
      expect(
        tester.widget<Scaffold>(find.byType(Scaffold)).extendBody,
        isFalse,
      );
      final rect = tester.getRect(byId(NavigationTestIds.bottomBarRoot));
      expect(rect.left, 0);
      expect(rect.right, 400);
    });
  });

  group('원형 내비 버튼 재질', () {
    Future<void> pumpButton(WidgetTester tester, bool glass) =>
        tester.pumpWidget(
          ChalkakGlassScope(
            usesGlass: glass,
            child: MaterialApp(
              home: Center(child: ChalkakNavButton.close(onPressed: () {})),
            ),
          ),
        );

    widgetTest('유리: 44 원 블러 면', (tester) async {
      await pumpButton(tester, true);
      final glass = find.byKey(const Key('chalkak-nav-button-glass'));
      expect(glass, findsOneWidget);
      expect(tester.getSize(glass), const Size.square(44));
      expect(find.byType(BackdropFilter), findsOneWidget);
    });

    widgetTest('평면: 아이콘만, 블러 없음', (tester) async {
      await pumpButton(tester, false);
      expect(find.byKey(const Key('chalkak-nav-button-glass')), findsNothing);
      expect(find.byType(BackdropFilter), findsNothing);
    });
  });

  group('시트 재질', () {
    Future<void> openSheet(WidgetTester tester, bool glass) async {
      await tester.pumpWidget(
        ChalkakGlassScope(
          usesGlass: glass,
          child: MaterialApp(
            home: Builder(
              builder: (context) => TextButton(
                onPressed: () => showChalkakBottomSheet<void>(
                  context: context,
                  builder: (_) => const SizedBox(height: 100, child: Text('s')),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    widgetTest('유리: 블러 시트 배경', (tester) async {
      await openSheet(tester, true);
      expect(find.byType(GlassSheetSurface), findsOneWidget);
      expect(find.byType(BackdropFilter), findsOneWidget);
    });

    widgetTest('평면: 기본 시트', (tester) async {
      await openSheet(tester, false);
      expect(find.byType(GlassSheetSurface), findsNothing);
      expect(find.byType(BackdropFilter), findsNothing);
    });
  });
}
