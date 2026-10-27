import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/domain/signature_mode.dart';
import 'package:chalkak/features/signature/presentation/signature_draw_screen.dart';
import 'package:chalkak/features/signature/presentation/signature_draw_view_model.dart';
import 'package:chalkak/features/signature/presentation/signature_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

class _Screen {
  _Screen(this.renderer, this.analytics, this.vm, this.events);
  final FakeSignatureRenderer renderer;
  final FakeAnalyticsTracker analytics;
  final SignatureDrawViewModel vm;
  final List<SignatureDrawEvent> events;
}

Future<_Screen> _open(
  WidgetTester tester, {
  SignatureMode mode = SignatureMode.onboarding,
  FakeSignatureRenderer? renderer,
}) async {
  final r = renderer ?? FakeSignatureRenderer();
  final analytics = FakeAnalyticsTracker();
  final vm = SignatureDrawViewModel(
    mode: mode,
    renderer: r,
    analytics: analytics,
    canvasWidth: 300,
    canvasHeight: 150,
  );
  addTearDown(vm.dispose);
  final events = <SignatureDrawEvent>[];
  await pumpScreen(
    tester,
    SignatureDrawScreen(viewModel: vm, onEvent: events.add),
  );
  return _Screen(r, analytics, vm, events);
}

Future<void> _scribble(WidgetTester tester) async {
  await tester.drag(byId(SignatureTestIds.drawCanvas), const Offset(80, 30));
  await settleUi(tester, frames: 3);
}

void main() {
  widgetTest('TC-SIGN-001 제목·안내·캔버스·힌트와 세 버튼이 보이고 모두 비활성이다', (tester) async {
    await _open(tester);
    expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.drawTitle),
        matching: find.text(Copy.onbSignTitle),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(SignatureTestIds.drawGuideText),
        matching: find.text(Copy.onbSignGuide),
      ),
      findsOneWidget,
    );
    expect(byId(SignatureTestIds.drawCanvas), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.drawCanvasHint),
        matching: find.text(Copy.onbSignPadHint),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.onbSignUndo), findsOneWidget);
    expect(find.text(Copy.onbSignClear), findsOneWidget);
    expect(find.text(Copy.onbSignConfirm), findsOneWidget);
    expect(isEnabled(tester, SignatureTestIds.drawUndoButton), isFalse);
    expect(isEnabled(tester, SignatureTestIds.drawClearButton), isFalse);
    expect(isEnabled(tester, SignatureTestIds.drawSubmitButton), isFalse);
    expect(byId(SignatureTestIds.drawErrorMessage), findsNothing);
  });

  widgetTest('TC-SIGN-001 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _open(tester);
    for (final id in [
      SignatureTestIds.drawRoot,
      SignatureTestIds.drawTitle,
      SignatureTestIds.drawGuideText,
      SignatureTestIds.drawCanvas,
      SignatureTestIds.drawUndoButton,
      SignatureTestIds.drawClearButton,
      SignatureTestIds.drawSubmitButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('TC-SIGN-004 캔버스를 드래그하면 힌트가 사라지고 세 버튼이 활성이 된다', (tester) async {
    final s = await _open(tester);
    await _scribble(tester);
    expect(s.vm.state.drawing.hasSignature, isTrue);
    expect(byId(SignatureTestIds.drawCanvasHint), findsNothing);
    expect(isEnabled(tester, SignatureTestIds.drawUndoButton), isTrue);
    expect(isEnabled(tester, SignatureTestIds.drawClearButton), isTrue);
    expect(isEnabled(tester, SignatureTestIds.drawSubmitButton), isTrue);
  });

  widgetTest('TC-SIGN-006 TC-SIGN-007 되돌리기·전체 지우기 버튼이 획을 지운다', (tester) async {
    final s = await _open(tester);
    await _scribble(tester);
    await _scribble(tester);
    expect(s.vm.state.drawing.strokes, hasLength(2));
    await tester.tap(byId(SignatureTestIds.drawUndoButton));
    await settleUi(tester, frames: 3);
    expect(s.vm.state.drawing.strokes, hasLength(1));
    await tester.tap(byId(SignatureTestIds.drawClearButton));
    await settleUi(tester, frames: 3);
    expect(s.vm.state.drawing.strokes, isEmpty);
    expect(isEnabled(tester, SignatureTestIds.drawSubmitButton), isFalse);
    expect(byId(SignatureTestIds.drawCanvasHint), findsOneWidget);
  });

  widgetTest('TC-SIGN-008 확정 버튼을 연타해도 미리보기 이벤트는 한 번이다', (tester) async {
    final s = await _open(tester);
    await _scribble(tester);
    for (var i = 0; i < 3; i++) {
      await tester.tap(byId(SignatureTestIds.drawSubmitButton));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await settleUi(tester);
    expect(s.renderer.calls, 1);
    expect(s.events.whereType<NavigateToPreview>(), hasLength(1));
  });

  widgetTest('TC-SIGN-015 PNG가 1 MiB를 넘으면 오류 문구가 보이고 이동하지 않는다', (tester) async {
    final s = await _open(
      tester,
      renderer: FakeSignatureRenderer(fakePng(1048577)),
    );
    await _scribble(tester);
    await tester.tap(byId(SignatureTestIds.drawSubmitButton));
    await settleUi(tester);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.drawErrorMessage),
        matching: find.text(Copy.signErrorTooLarge),
      ),
      findsOneWidget,
    );
    expect(s.events, isEmpty);
    expect(isEnabled(tester, SignatureTestIds.drawSubmitButton), isTrue);
  });

  widgetTest('TC-ONB-049 TC-SIGN-043 화면이 보이면 모드별 screen_view를 한 번 보낸다', (
    tester,
  ) async {
    final onboarding = await _open(tester);
    expect(onboarding.analytics.screenNames, ['onboarding_signature']);
    final change = await _open(tester, mode: SignatureMode.change);
    expect(change.analytics.screenNames, ['change_signature']);
  });

  widgetTest('TC-SIGN-001 뒤로 버튼은 뒤로 가기 이벤트를 낸다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(SignatureTestIds.drawBackButton));
    await settleUi(tester, frames: 3);
    expect(s.events.single, isA<NavigateBackFromDrawing>());
  });
}
