import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:chalkak/features/signature/domain/signature_mode.dart';
import 'package:chalkak/features/signature/presentation/signature_preview_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/onboarding_fakes.dart';

class _Rig {
  _Rig({
    SignatureMode mode = SignatureMode.onboarding,
    FakeSignatureSubmitter? submitter,
  }) : submitter = submitter ?? FakeSignatureSubmitter() {
    vm = SignaturePreviewViewModel(
      mode: mode,
      png: tinyPng,
      submitter: this.submitter,
      analytics: analytics,
    );
    vm.events.listen(events.add);
  }

  final FakeSignatureSubmitter submitter;
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<SignaturePreviewEvent> events = [];
  late final SignaturePreviewViewModel vm;

  SignaturePreviewState get state => vm.state;

  void confirm(FakeAsync async) {
    vm.onConfirmPressed();
    settle(async);
  }

  void failWith(SignatureFailureKind kind, {String? message}) =>
      submitter.outcome = SignatureSubmitFailed(
        SignatureFailure(kind, serverMessage: message),
      );
}

void main() {
  group('초기 상태', () {
    fakeTest('TC-ONB-048 처음에는 진행 중도 오류도 아니고 PNG와 모드를 들고 있다', (async) {
      final r = _Rig();
      expect(r.state.isSubmitting, isFalse);
      expect(r.state.error, isNull);
      expect(r.state.png, tinyPng);
      expect(r.state.mode, SignatureMode.onboarding);
    });

    fakeTest('TC-SIGN-018 다시 그리기는 서버 호출 없이 이동 이벤트만 낸다', (async) {
      final r = _Rig(mode: SignatureMode.change);
      r.vm.onRedrawPressed();
      settle(async);
      expect(r.events.single, isA<PreviewRedraw>());
      expect(r.submitter.calls, 0);
    });
  });

  group('가입 모드', () {
    fakeTest('TC-ONB-043 시작하기를 3회 연타해도 제출은 한 번이다', (async) {
      final submitter = FakeSignatureSubmitter()..gate = Completer<void>();
      final r = _Rig(submitter: submitter);
      for (var i = 0; i < 3; i++) {
        r.vm.onConfirmPressed();
      }
      settle(async);
      expect(submitter.calls, 1);
      expect(r.state.isSubmitting, isTrue);
      submitter.gate!.complete();
      settle(async);
      expect(submitter.calls, 1);
    });

    fakeTest('TC-ONB-024 성공하면 가입 완료 이벤트를 한 번 내고 제출 중 상태를 유지한다', (async) {
      final r = _Rig();
      r.confirm(async);
      expect(r.events.single, isA<PreviewSignUpCompleted>());
      expect(r.state.isSubmitting, isTrue);
      expect(r.state.error, isNull);
      r.vm.onConfirmPressed();
      settle(async);
      expect(r.submitter.calls, 1);
    });

    fakeTest('TC-ONB-012 제출한 PNG는 미리보기 PNG 그대로다', (async) {
      final r = _Rig();
      r.confirm(async);
      expect(r.submitter.submitted.single, tinyPng);
    });

    fakeTest('TC-ONB-041 네트워크 실패는 네트워크 문구를 보이고 다시 누를 수 있다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.network);
      r.confirm(async);
      expect(r.state.error!.text, Copy.signErrorNetwork);
      expect(r.state.isSubmitting, isFalse);
      expect(r.state.png, tinyPng);
      expect(r.events, isEmpty);
      r.submitter.outcome = const SignatureSubmitSucceeded();
      r.confirm(async);
      expect(r.submitter.calls, 2);
      expect(r.state.error, isNull);
      expect(r.events.single, isA<PreviewSignUpCompleted>());
    });

    fakeTest('TC-ONB-042 일반 실패는 가입 실패 문구를 보이고 미리보기에 머문다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.generic);
      r.confirm(async);
      expect(r.state.error!.text, Copy.onbSignupErrorGeneric);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-ONB-028 재시도 소진은 timeout 문구를 보이고 요청을 멈춘다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.timeout);
      r.confirm(async);
      expect(r.state.error!.text, Copy.onbSignupErrorTimeout);
      expect(r.state.isSubmitting, isFalse);
      expect(r.submitter.calls, 1);
    });

    fakeTest('TC-ONB-029 타임아웃 뒤 다시 누르면 처음부터 다시 제출한다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.timeout);
      r.confirm(async);
      r.confirm(async);
      expect(r.submitter.calls, 2);
    });

    fakeTest('TC-ONB-035 사용할 수 없는 사인이면 그리기 화면으로 돌아가며 문구를 넘긴다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.invalid);
      r.confirm(async);
      final e = r.events.single as PreviewReturnToDrawing;
      expect(e.message, Copy.signErrorInvalid);
      expect(r.state.isSubmitting, isFalse);
    });

    fakeTest('TC-ONB-036 업로드 없음은 다시 업로드 문구를 보이고 다시 시도할 수 있다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.reupload);
      r.confirm(async);
      expect(r.state.error!.text, Copy.onbSignupErrorReupload);
      expect(r.state.isSubmitting, isFalse);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-ONB-033 TC-ONB-030 만료는 로그인 화면으로 돌아가며 expired 문구를 넘긴다', (
      async,
    ) {
      final r = _Rig()..failWith(SignatureFailureKind.expired);
      r.confirm(async);
      expect(
        (r.events.single as PreviewReturnToLogin).message,
        Copy.signErrorExpired,
      );
    });

    fakeTest('TC-ONB-032 차단된 계정은 서버 message를 보이고 로그인 화면으로 돌아간다', (async) {
      final r = _Rig()
        ..failWith(SignatureFailureKind.forbidden, message: '차단된 소셜 계정입니다.');
      r.confirm(async);
      expect(r.state.error!.text, '차단된 소셜 계정입니다.');
      expect(
        (r.events.single as PreviewReturnToLogin).message,
        '차단된 소셜 계정입니다.',
      );
    });

    fakeTest('TC-ONB-037 가입 확정 403도 서버 message를 보여 준다', (async) {
      final r = _Rig()
        ..failWith(SignatureFailureKind.forbidden, message: '차단된 소셜 계정입니다.');
      r.confirm(async);
      expect(r.state.error!.text, '차단된 소셜 계정입니다.');
    });

    fakeTest('TC-ONB-041 오류 알림을 닫으면 오류가 사라지고 사인은 유지된다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.generic);
      r.confirm(async);
      r.vm.dismissError();
      expect(r.state.error, isNull);
      expect(r.state.png, tinyPng);
    });

    fakeTest('TC-ONB-041 같은 오류가 연달아 나와도 id가 달라 다시 표시된다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.network);
      r.confirm(async);
      final first = r.state.error!.id;
      r.confirm(async);
      expect(r.state.error!.text, Copy.signErrorNetwork);
      expect(r.state.error!.id, isNot(first));
    });

    fakeTest('TC-ONB-041 다시 제출을 시작하면 이전 오류를 지운다', (async) {
      final r = _Rig()..failWith(SignatureFailureKind.network);
      r.confirm(async);
      expect(r.state.error, isNotNull);
      r.submitter.gate = Completer<void>();
      r.vm.onConfirmPressed();
      settle(async);
      expect(r.state.isSubmitting, isTrue);
      expect(r.state.error, isNull);
    });
  });

  group('취소', () {
    fakeTest('TC-ONB-044 TC-SIGN-037 진행 중 dispose하면 요청을 취소하고 결과를 버린다', (async) {
      final submitter = FakeSignatureSubmitter()..gate = Completer<void>();
      final r = _Rig(submitter: submitter);
      r.vm.onConfirmPressed();
      settle(async);
      expect(submitter.tokens.single.isCancelled, isFalse);
      r.vm.dispose();
      expect(submitter.tokens.single.isCancelled, isTrue);
      submitter.gate!.complete();
      settle(async);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-SIGN-037 취소 결과는 오류 없이 버린다', (async) {
      final r = _Rig()..submitter.outcome = const SignatureSubmitCancelled();
      r.confirm(async);
      expect(r.state.error, isNull);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-SIGN-037 확정 전에 dispose하면 서버 호출이 없고 오류도 없다', (async) {
      final r = _Rig(mode: SignatureMode.change);
      r.vm.dispose();
      expect(r.submitter.calls, 0);
    });
  });

  group('변경 모드', () {
    fakeTest('TC-SIGN-025 성공하면 토스트 문구를 담은 변경 완료 이벤트를 낸다', (async) {
      final r = _Rig(mode: SignatureMode.change);
      r.confirm(async);
      final e = r.events.single as PreviewChangeCompleted;
      expect(e.toastMessage, Copy.signChangeDone);
      expect(r.state.isSubmitting, isTrue);
    });

    fakeTest('TC-SIGN-036 사인 변경하기를 연타해도 제출은 한 번이다', (async) {
      final submitter = FakeSignatureSubmitter()..gate = Completer<void>();
      final r = _Rig(mode: SignatureMode.change, submitter: submitter);
      for (var i = 0; i < 3; i++) {
        r.vm.onConfirmPressed();
      }
      settle(async);
      expect(submitter.calls, 1);
      expect(r.state.isSubmitting, isTrue);
    });

    fakeTest('TC-SIGN-030 정지 회원은 D-08 문구를 보이고 이동하지 않는다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.forbidden, message: '차단된 회원입니다.');
      r.confirm(async);
      expect(r.state.error!.text, Copy.authBannedSignature);
      expect(r.events, isEmpty);
      expect(r.state.isSubmitting, isFalse);
    });

    fakeTest('TC-SIGN-034 네트워크 오류는 네트워크 문구를 보이고 미리보기가 유지된다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.network);
      r.confirm(async);
      expect(r.state.error!.text, Copy.signErrorNetwork);
      expect(r.state.png, tinyPng);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-SIGN-023 TC-SIGN-035 일반 실패는 sign.change.error.generic이다', (
      async,
    ) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.generic);
      r.confirm(async);
      expect(r.state.error!.text, Copy.signChangeErrorGeneric);
    });

    fakeTest('TC-SIGN-028 다시 업로드가 필요하면 문구를 보이고 다음 시도는 새로 제출한다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.reupload);
      r.confirm(async);
      expect(r.state.error!.text, Copy.onbSignupErrorReupload);
      r.confirm(async);
      expect(r.submitter.calls, 2);
    });

    fakeTest('TC-SIGN-029 사용할 수 없는 사인이면 그리기 화면으로 돌아간다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.invalid);
      r.confirm(async);
      expect(
        (r.events.single as PreviewReturnToDrawing).message,
        Copy.signErrorInvalid,
      );
    });

    fakeTest('TC-SIGN-032 업로드 파일 없음은 not-found 문구를 보인다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.notFound);
      r.confirm(async);
      expect(r.state.error!.text, Copy.signChangeErrorNotFound);
    });

    fakeTest('TC-SIGN-033 변경 흐름의 만료는 로그인 화면으로 돌아간다', (async) {
      final r = _Rig(mode: SignatureMode.change)
        ..failWith(SignatureFailureKind.expired);
      r.confirm(async);
      expect(
        (r.events.single as PreviewReturnToLogin).message,
        Copy.signErrorExpired,
      );
    });
  });

  group('분석', () {
    fakeTest('TC-ONB-049 가입 모드는 onboarding_signature_preview를 한 번만 보낸다', (
      async,
    ) {
      final r = _Rig();
      r.vm.onShown();
      r.vm.onShown();
      expect(r.analytics.screenNames, ['onboarding_signature_preview']);
    });

    fakeTest('TC-SIGN-043 변경 모드는 change_signature_preview를 한 번만 보낸다', (async) {
      final r = _Rig(mode: SignatureMode.change);
      r.vm.onShown();
      r.vm.onShown();
      expect(r.analytics.screenNames, ['change_signature_preview']);
    });
  });
}
