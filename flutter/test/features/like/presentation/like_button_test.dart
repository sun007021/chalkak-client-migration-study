import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:chalkak/features/like/presentation/like_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

final _button = DisplayTestIds.likeButton(myPostId);
final _count = DisplayTestIds.likeCount(myPostId);

Future<void> _pump(
  WidgetTester tester, {
  bool isLiked = false,
  int count = 38,
}) => pumpScreen(
  tester,
  Scaffold(
    body: LikeButton(
      buttonId: _button,
      countId: _count,
      isLiked: isLiked,
      likeCount: count,
      onPressed: () {},
    ),
  ),
);

void main() {
  widgetTest('TC-LIKE-034 버튼과 좋아요 수가 testID로 따로 존재하고 수는 숫자로 보인다', (
    tester,
  ) async {
    await _pump(tester, count: 38);
    expect(byId(_button), findsOneWidget);
    expect(byId(_count), findsOneWidget);
    expect(
      find.descendant(of: byId(_count), matching: find.text('38')),
      findsOneWidget,
    );
  });

  widgetTest('TC-LIKE-034 isLiked가 selected로, enabled가 enabled로 노출된다', (
    tester,
  ) async {
    await _pump(tester, isLiked: true);
    expect(isSelected(tester, _button), isTrue);
    expect(isEnabled(tester, _button), isTrue);
  });

  widgetTest('TC-LIKE-034 좋아요하지 않은 상태는 selected가 아니다', (tester) async {
    await _pump(tester, isLiked: false);
    expect(isSelected(tester, _button), isFalse);
  });

  widgetTest('TC-LIKE-003 값이 바뀌면 다시 그려 수가 즉시 바뀐다', (tester) async {
    await _pump(tester, count: 38);
    await _pump(tester, isLiked: true, count: 39);
    expect(
      find.descendant(of: byId(_count), matching: find.text('39')),
      findsOneWidget,
    );
    expect(isSelected(tester, _button), isTrue);
  });

  widgetTest('TC-LIKE-024 enabled=false이면 비활성으로 노출되고 눌러도 콜백이 불리지 않는다', (
    tester,
  ) async {
    var taps = 0;
    await pumpScreen(
      tester,
      Scaffold(
        body: LikeButton(
          buttonId: _button,
          countId: _count,
          isLiked: false,
          likeCount: 1,
          enabled: false,
          onPressed: () => taps++,
        ),
      ),
    );
    expect(isEnabled(tester, _button), isFalse);
    await tester.tap(byId(_button), warnIfMissed: false);
    await settleUi(tester, frames: 2);
    expect(taps, 0);
  });

  widgetTest('TC-LIKE-006 활성 상태에서 누르면 콜백이 한 번 불린다', (tester) async {
    var taps = 0;
    await pumpScreen(
      tester,
      Scaffold(
        body: LikeButton(
          buttonId: _button,
          countId: _count,
          isLiked: false,
          likeCount: 1,
          onPressed: () => taps++,
        ),
      ),
    );
    await tester.tap(byId(_button));
    await settleUi(tester, frames: 2);
    expect(taps, 1);
  });
}
