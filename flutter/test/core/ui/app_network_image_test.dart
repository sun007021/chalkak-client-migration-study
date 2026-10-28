import 'package:chalkak/core/ui/app_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) => MaterialApp(
  home: Scaffold(
    body: Center(child: SizedBox(width: 100, height: 100, child: child)),
  ),
);

/// 이미지 로드 실패는 실제 비동기로 도착하므로 잠시 흘려보낸 뒤 프레임을 그린다.
Future<void> _settle(WidgetTester tester) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  // 테스트 환경의 Image.network는 HTTP 400을 돌려받아 항상 errorBuilder 경로로 간다(결정적).
  testWidgets('TC-FEED-014 사인 이미지 로드 실패: 사인은 생략되고 예외가 없다', (tester) async {
    await tester.pumpWidget(
      _host(
        const AppNetworkImage(
          url: 'https://example.invalid/sign.png',
          omitOnError: true,
        ),
      ),
    );
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.image_not_supported_outlined), findsNothing);
    final omitted = tester.widget<SizedBox>(
      find.descendant(
        of: find.byType(AppNetworkImage),
        matching: find.byType(SizedBox),
      ),
    );
    expect(omitted.width, 0);
    expect(omitted.height, 0);
  });

  testWidgets('TC-FEED-014 원본 사진 로드 실패: 자리표시자가 보인다', (tester) async {
    await tester.pumpWidget(
      _host(const AppNetworkImage(url: 'https://example.invalid/photo.png')),
    );
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.image_not_supported_outlined), findsOneWidget);
  });

  testWidgets('TC-FEED-014 사진은 남고 사인만 생략된다', (tester) async {
    await tester.pumpWidget(
      _host(
        const Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(url: 'https://example.invalid/photo.png'),
            AppNetworkImage(
              url: 'https://example.invalid/sign.png',
              omitOnError: true,
            ),
          ],
        ),
      ),
    );
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.image_not_supported_outlined), findsOneWidget);
    expect(find.byType(AppNetworkImage), findsNWidgets(2));
  });
}
