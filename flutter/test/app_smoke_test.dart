import 'package:chalkak/core/ui/test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/app_harness.dart';

void main() {
  widgetTest('앱이 뜨면 스플래시를 먼저 그린다', (tester) async {
    final h = AppHarness();
    await tester.pumpWidget(h.app);
    expect(byId(TestIds.splashLogo), findsOneWidget);
  });
}
