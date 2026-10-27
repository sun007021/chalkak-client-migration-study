import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:chalkak/features/signature/domain/signature_mode.dart';
import 'package:chalkak/features/signature/presentation/signature_preview_screen.dart';
import 'package:chalkak/features/signature/presentation/signature_preview_view_model.dart';
import 'package:chalkak/features/signature/presentation/signature_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

/// 다이얼로그 닫힘 애니메이션(플랫폼 기본)이 끝나도록 흘리는 프레임 수(16ms x 30).
const _dialogCloseFrames = 30;

class _Screen {
  _Screen(this.vm, this.submitter, this.analytics, this.events);
  final SignaturePreviewViewModel vm;
  final FakeSignatureSubmitter submitter;
  final FakeAnalyticsTracker analytics;
  final List<SignaturePreviewEvent> events;
}

Future<_Screen> _open(
  WidgetTester tester, {
  SignatureMode mode = SignatureMode.onboarding,
  FakeSignatureSubmitter? submitter,
}) async {
  final s = submitter ?? FakeSignatureSubmitter();
  final analytics = FakeAnalyticsTracker();
  final vm = SignaturePreviewViewModel(
    mode: mode,
    png: tinyPng,
    submitter: s,
    analytics: analytics,
  );
  addTearDown(vm.dispose);
  final events = <SignaturePreviewEvent>[];
  await pumpScreen(
    tester,
    SignaturePreviewScreen(viewModel: vm, onEvent: events.add),
  );
  return _Screen(vm, s, analytics, events);
}

void main() {
  widgetTest('TC-ONB-048 가입 모드: 제목·이미지·다시 그리기·시작하기가 보이고 변경 안내는 없다', (
    tester,
  ) async {
    await _open(tester);
    expect(byId(SignatureTestIds.previewRoot), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewTitle),
        matching: find.text(Copy.onbSignPreviewTitle),
      ),
      findsOneWidget,
    );
    expect(byId(SignatureTestIds.previewImage), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewRedrawButton),
        matching: find.text(Copy.onbSignPreviewRedraw),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewConfirmButton),
        matching: find.text(Copy.onbSignPreviewStart),
      ),
      findsOneWidget,
    );
    expect(byId(SignatureTestIds.previewChangeNotice), findsNothing);
    expect(find.text(Copy.signChangeNotice), findsNothing);
    expect(byId(SignatureTestIds.previewLoading), findsNothing);
    expect(byId(SignatureTestIds.previewErrorMessage), findsNothing);
    expect(isEnabled(tester, SignatureTestIds.previewConfirmButton), isTrue);
  });

  widgetTest('TC-SIGN-017 변경 모드: 사인 변경하기 버튼과 안내 문구가 보인다', (tester) async {
    await _open(tester, mode: SignatureMode.change);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewTitle),
        matching: find.text(Copy.onbSignPreviewTitle),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewConfirmButton),
        matching: find.text(Copy.signChangeConfirm),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewChangeNotice),
        matching: find.text(Copy.signChangeNotice),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.onbSignPreviewStart), findsNothing);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewRedrawButton),
        matching: find.text(Copy.onbSignPreviewRedraw),
      ),
      findsOneWidget,
    );
  });

  widgetTest('TC-ONB-048 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _open(tester);
    for (final id in [
      SignatureTestIds.previewRoot,
      SignatureTestIds.previewTitle,
      SignatureTestIds.previewImage,
      SignatureTestIds.previewRedrawButton,
      SignatureTestIds.previewConfirmButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('TC-ONB-043 시작하기를 연타하면 진행 표시가 보이고 버튼은 비활성이며 제출은 한 번이다', (
    tester,
  ) async {
    final submitter = FakeSignatureSubmitter()..gate = Completer<void>();
    final s = await _open(tester, submitter: submitter);
    for (var i = 0; i < 3; i++) {
      await tester.tap(byId(SignatureTestIds.previewConfirmButton));
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(s.submitter.calls, 1);
    expect(byId(SignatureTestIds.previewLoading), findsOneWidget);
    expect(isEnabled(tester, SignatureTestIds.previewConfirmButton), isFalse);
    submitter.gate!.complete();
    await settleUi(tester);
  });

  widgetTest('TC-SIGN-018 다시 그리기를 누르면 이동 이벤트를 내고 서버를 부르지 않는다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(SignatureTestIds.previewRedrawButton));
    await settleUi(tester, frames: 3);
    expect(s.events.single, isA<PreviewRedraw>());
    expect(s.submitter.calls, 0);
  });

  widgetTest('TC-ONB-041 가입 모드의 오류는 알림 대화상자로 보이고 확인을 누르면 닫힌다', (tester) async {
    final submitter = FakeSignatureSubmitter(
      const SignatureSubmitFailed(
        SignatureFailure(SignatureFailureKind.network),
      ),
    );
    await _open(tester, submitter: submitter);
    await tester.tap(byId(SignatureTestIds.previewConfirmButton));
    await settleUi(tester);
    expect(byId(SignatureTestIds.previewErrorDialog), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewErrorMessage),
        matching: find.text(Copy.signErrorNetwork),
      ),
      findsOneWidget,
    );
    expect(isEnabled(tester, SignatureTestIds.previewConfirmButton), isTrue);
    await tester.tap(byId(SignatureTestIds.previewErrorDialogConfirmButton));
    await settleUi(tester, frames: _dialogCloseFrames);
    expect(byId(SignatureTestIds.previewErrorDialog), findsNothing);
    expect(byId(SignatureTestIds.previewErrorMessage), findsNothing);
  });

  widgetTest('TC-SIGN-034 변경 모드의 오류는 대화상자 없이 오류 문구로 보인다', (tester) async {
    final submitter = FakeSignatureSubmitter(
      const SignatureSubmitFailed(
        SignatureFailure(SignatureFailureKind.network),
      ),
    );
    await _open(tester, mode: SignatureMode.change, submitter: submitter);
    await tester.tap(byId(SignatureTestIds.previewConfirmButton));
    await settleUi(tester);
    expect(byId(SignatureTestIds.previewErrorDialog), findsNothing);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.previewErrorMessage),
        matching: find.text(Copy.signErrorNetwork),
      ),
      findsOneWidget,
    );
    expect(byId(SignatureTestIds.previewImage), findsOneWidget);
  });

  widgetTest('TC-ONB-049 TC-SIGN-043 화면이 보이면 모드별 screen_view를 한 번 보낸다', (
    tester,
  ) async {
    final onboarding = await _open(tester);
    expect(onboarding.analytics.screenNames, ['onboarding_signature_preview']);
    final change = await _open(tester, mode: SignatureMode.change);
    expect(change.analytics.screenNames, ['change_signature_preview']);
  });
}
