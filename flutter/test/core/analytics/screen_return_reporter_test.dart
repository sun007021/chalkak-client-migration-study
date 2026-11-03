import 'package:chalkak/core/analytics/screen_return_reporter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 관찰자는 라우터(Navigator)마다 따로 있어야 한다(전역 싱글턴이면 두 번째 Navigator에서 assert).
Future<int> _backReturns(WidgetTester tester) async {
  var returns = 0;
  final observer = ScreenReturnObserver();
  await tester.pumpWidget(
    ScreenReturnScope(
      observer: observer,
      child: MaterialApp(
        navigatorObservers: [observer],
        home: ScreenReturnReporter(
          onReturn: () => returns++,
          child: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => const Scaffold(body: Text('top')),
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  Navigator.of(tester.element(find.text('top'))).pop();
  await tester.pumpAndSettle();
  return returns;
}

void main() {
  testWidgets('TC-ANL-017 관찰자가 라우터마다 따로라 라우터를 연달아 만들어도 복귀를 보고한다', (
    tester,
  ) async {
    expect(await _backReturns(tester), 1);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(await _backReturns(tester), 1);
  });

  testWidgets('TC-ANL-017 두 라우터가 동시에 떠 있어도 서로의 관찰자를 건드리지 않는다', (tester) async {
    var first = 0;
    var second = 0;
    Widget app(ScreenReturnObserver observer, VoidCallback onReturn) =>
        ScreenReturnScope(
          observer: observer,
          child: MaterialApp(
            navigatorObservers: [observer],
            home: ScreenReturnReporter(
              onReturn: onReturn,
              child: Builder(
                builder: (context) => TextButton(
                  onPressed: () => Navigator.of(context).push<void>(
                    MaterialPageRoute<void>(builder: (_) => const Text('top')),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        );
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Column(
          children: [
            Expanded(child: app(ScreenReturnObserver(), () => first++)),
            Expanded(child: app(ScreenReturnObserver(), () => second++)),
          ],
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(first + second, 0);
  });
}
