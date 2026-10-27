import 'package:chalkak/app/chalkak_app.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('앱이 뜬다', (tester) async {
    await tester.pumpWidget(const ChalkakApp());
    expect(find.text('찰캌'), findsOneWidget);
  });
}
