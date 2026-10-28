import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/feedback/presentation/feedback_screen.dart';
import 'package:chalkak/features/feedback/presentation/feedback_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, isEnabled, widgetTest;
import '../../../support/feedback_fakes.dart';

const _created = 'feedback/feedbacks__created.json';
const _internal = 'feedback/feedbacks__internal-error.json';

Future<void> _pump(
  WidgetTester tester,
  FeedbackRig r, {
  VoidCallback? onClose,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: FeedbackScreen(viewModel: r.vm, onClose: onClose ?? () {}),
    ),
  );
  await _settle(tester, const Duration(milliseconds: 500));
}

Future<void> _settle(
  WidgetTester tester, [
  Duration total = const Duration(seconds: 4),
]) async {
  for (var i = 0; i < total.inMilliseconds ~/ 250; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
}

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(
    find.descendant(
      of: byId(FeedbackTestIds.input),
      matching: find.byType(TextField),
    ),
    text,
  );
  await tester.pump();
}

Future<void> _submit(WidgetTester tester) async {
  await tester.tap(byId(FeedbackTestIds.submitButton));
  await tester.pump(const Duration(milliseconds: 100));
}

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

void main() {
  widgetTest('TC-FDBK-002 안내 문구, 입력창 플레이스홀더, 카운터, 보내기 버튼이 보인다', (tester) async {
    final r = FeedbackRig();
    await _pump(tester, r);
    for (final id in [
      FeedbackTestIds.root,
      FeedbackTestIds.closeButton,
      FeedbackTestIds.guideText,
      FeedbackTestIds.input,
      FeedbackTestIds.counter,
      FeedbackTestIds.submitButton,
    ]) {
      expect(byId(id), findsOneWidget, reason: id);
    }
    expect(
      find.descendant(
        of: byId(FeedbackTestIds.guideText),
        matching: find.textContaining('찰칵을 사용하며'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(FeedbackTestIds.guideText),
        matching: find.textContaining('자유롭게 남겨주세요'),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.fdbkFieldPlaceholder), findsOneWidget);
    expect(_text(FeedbackTestIds.counter, '0/1000'), findsOneWidget);
    expect(_text(FeedbackTestIds.submitButton, Copy.fdbkSend), findsOneWidget);
    expect(byId(FeedbackTestIds.validationMessage), findsNothing);
    expect(byId(FeedbackTestIds.errorMessage), findsNothing);
    expect(r.analytics.screenNames, ['feedback']);
  });

  widgetTest('TC-FDBK-003 초기에는 보내기가 비활성이고 입력하면 활성이 된다', (tester) async {
    final r = FeedbackRig();
    await _pump(tester, r);
    expect(isEnabled(tester, FeedbackTestIds.submitButton), isFalse);
    await _type(tester, '안녕');
    expect(isEnabled(tester, FeedbackTestIds.submitButton), isTrue);
    await _type(tester, '   ');
    expect(isEnabled(tester, FeedbackTestIds.submitButton), isFalse);
  });

  widgetTest('TC-FDBK-013 카운터는 trim 후 code point 수를 보인다', (tester) async {
    final r = FeedbackRig();
    await _pump(tester, r);
    await _type(tester, '  ab  ');
    expect(_text(FeedbackTestIds.counter, '2/1000'), findsOneWidget);
    await _type(tester, familyEmoji);
    expect(_text(FeedbackTestIds.counter, '5/1000'), findsOneWidget);
    await _type(tester, repeat('a', 1001));
    expect(_text(FeedbackTestIds.counter, '1001/1000'), findsOneWidget);
  });

  widgetTest('TC-FDBK-007 1001자를 보내면 검증 문구가 보이고 요청이 없다', (tester) async {
    final r = FeedbackRig(repository: FakeFeedbackRepository());
    await _pump(tester, r);
    await _type(tester, repeat('a', 1001));
    await _submit(tester);
    expect(
      _text(FeedbackTestIds.validationMessage, Copy.fdbkErrorInvalid),
      findsOneWidget,
    );
    expect((r.vm.state.text), repeat('a', 1001));
  });

  widgetTest('TC-FDBK-014 10만 자를 붙여넣어도 카운터가 정확하고 전송은 거부된다', (tester) async {
    final fake = FakeFeedbackRepository();
    final r = FeedbackRig(repository: fake);
    await _pump(tester, r);
    await _type(tester, repeat('a', 100000));
    expect(_text(FeedbackTestIds.counter, '100000/1000'), findsOneWidget);
    await _submit(tester);
    expect(fake.calls, 0);
    expect(byId(FeedbackTestIds.validationMessage), findsOneWidget);
  });

  widgetTest('TC-FDBK-018 전송 중에는 버튼이 "보내는 중..."이고 비활성이다', (tester) async {
    final fake = FakeFeedbackRepository()..gate = Completer<void>();
    final r = FeedbackRig(repository: fake);
    await _pump(tester, r);
    await _type(tester, '내용');
    await _submit(tester);
    expect(
      _text(FeedbackTestIds.submitButton, Copy.fdbkSending),
      findsOneWidget,
    );
    expect(isEnabled(tester, FeedbackTestIds.submitButton), isFalse);
    expect(fake.calls, 1);
    fake.gate!.complete();
    await _settle(tester, const Duration(seconds: 1));
  });

  widgetTest('TC-FDBK-017 전송에 성공하면 화면을 닫는다', (tester) async {
    final fake = FakeFeedbackRepository();
    final r = FeedbackRig(repository: fake);
    var closed = 0;
    await _pump(tester, r, onClose: () => closed++);
    await _type(tester, '내용');
    await _submit(tester);
    await _settle(tester, const Duration(seconds: 1));
    expect(closed, 1);
    expect(r.toast.messages, [Copy.fdbkSuccess]);
  });

  widgetTest('TC-FDBK-024 전송이 실패하면 오류 문구가 보이고 입력은 유지된다', (tester) async {
    final r = FeedbackRig();
    r.onPost([fx(_internal)]);
    await _pump(tester, r);
    await _type(tester, '내용');
    await _submit(tester);
    await _settle(tester, const Duration(seconds: 3));
    expect(
      _text(FeedbackTestIds.errorMessage, Copy.fdbkErrorGeneric),
      findsOneWidget,
    );
    expect(r.posts, 1);
    expect(r.vm.state.text, '내용');
    expect(isEnabled(tester, FeedbackTestIds.submitButton), isTrue);
  });

  widgetTest('REQ-FDBK-002 닫기 버튼을 누르면 onClose를 부른다', (tester) async {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    var closed = 0;
    await _pump(tester, r, onClose: () => closed++);
    await tester.tap(byId(FeedbackTestIds.closeButton));
    await tester.pump();
    expect(closed, 1);
  });
}
