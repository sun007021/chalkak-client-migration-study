import 'package:chalkak/core/design/chalkak_theme.dart';
import 'package:chalkak/core/design/chalkak_tokens.dart';
import 'package:chalkak/core/ui/components/chalkak_button.dart';
import 'package:chalkak/core/ui/components/chalkak_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget child) => MaterialApp(
  theme: buildChalkakTheme(),
  home: Scaffold(body: Center(child: child)),
);

void main() {
  const t = ChalkakTokens();

  testWidgets('주 버튼은 토큰 색·라운드·높이를 쓰고 비활성은 12% 색이다', (tester) async {
    await tester.pumpWidget(
      _app(
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ChalkakButton(label: '활성', onPressed: () {}),
            const ChalkakButton(label: '비활성', onPressed: null),
          ],
        ),
      ),
    );
    Material surface(int i) => tester.widget<Material>(
      find
          .descendant(
            of: find.byType(FilledButton).at(i),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(surface(0).color, t.colors.actionPrimary);
    expect(
      surface(0).shape,
      isA<RoundedRectangleBorder>().having(
        (s) => s.borderRadius,
        'borderRadius',
        BorderRadius.circular(t.radius.button),
      ),
    );
    expect(surface(1).color, t.colors.actionPrimary.withValues(alpha: 0.12));
    // 세로 안쪽 여백 17 + 글자 줄 높이로 높이가 정해진다(원본 버튼 높이 52 이상).
    expect(
      tester.getSize(find.byType(FilledButton).first).height,
      greaterThanOrEqualTo(52),
    );
  });

  testWidgets('확인 다이얼로그는 흰 카드(라운드 16)에 버튼을 같은 폭으로 나눈다', (tester) async {
    await tester.pumpWidget(
      _app(
        ChalkakDialog(
          title: '제목',
          message: '본문',
          actions: [
            ChalkakDialogButton(
              label: '취소',
              kind: ChalkakDialogButtonKind.cancel,
              onPressed: () {},
            ),
            ChalkakDialogButton(label: '확인', onPressed: () {}),
          ],
        ),
      ),
    );
    final dialog = tester.widget<Dialog>(find.byType(Dialog));
    expect(dialog.backgroundColor, t.colors.surfaceElevated);
    expect(
      dialog.shape,
      RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    );
    final cancel = tester.getSize(find.byType(FilledButton).at(0));
    final ok = tester.getSize(find.byType(FilledButton).at(1));
    expect(cancel.width, ok.width);
  });
}
