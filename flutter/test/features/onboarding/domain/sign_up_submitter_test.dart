import 'package:chalkak/features/auth/domain/signup_credentials.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_context.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_submitter.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance;
import '../../../support/onboarding_fakes.dart';

void main() {
  test('TC-ONB-046 begin은 이전 쌍을 새 쌍으로 교체한다', () {
    final c = SignUpContext();
    expect(c.current, isNull);
    c.begin(kakaoCredentials);
    expect(c.current!.idToken, 'kakao-id-token-1');
    c.begin(const SignUpCredentials(idToken: 'new-id', rawNonce: 'new-nonce'));
    expect(c.current!.idToken, 'new-id');
    expect(c.current!.rawNonce, 'new-nonce');
  });

  test('TC-ONB-017 discard하면 쌍이 사라진다', () {
    final c = SignUpContext()..begin(kakaoCredentials);
    c.discard();
    expect(c.current, isNull);
  });

  fakeTest('TC-ONB-023 컨텍스트가 없으면 서버를 부르지 않고 expired 실패다', (async) {
    final h = OnboardingHarness();
    final s = SignUpSubmitter(useCase: h.signUp, context: SignUpContext());
    final out = resolve(async, s.submit(tinyPng, CancelToken()));
    expect(
      (out as SignatureSubmitFailed).failure.kind,
      SignatureFailureKind.expired,
    );
    expect(h.adapter.requests, isEmpty);
  });

  fakeTest('TC-ONB-024 TC-ONB-046 성공하면 컨텍스트를 폐기하고 제출은 컨텍스트의 쌍을 쓴다', (async) {
    final h = OnboardingHarness()..scriptSignupSuccess();
    final ctx = SignUpContext()..begin(kakaoCredentials);
    final s = SignUpSubmitter(useCase: h.signUp, context: ctx);
    expect(
      resolve(async, s.submit(tinyPng, CancelToken())),
      isA<SignatureSubmitSucceeded>(),
    );
    expect(ctx.current, isNull);
    expect(h.adapter.requests.first.jsonBody!['idToken'], 'kakao-id-token-1');
  });

  fakeTest('TC-ONB-033 expired 실패는 컨텍스트를 폐기한다', (async) {
    final h = OnboardingHarness()
      ..onSignupUploads('onboarding/signup-uploads__unauthorized.json');
    final ctx = SignUpContext()..begin(kakaoCredentials);
    final s = SignUpSubmitter(useCase: h.signUp, context: ctx);
    resolve(async, s.submit(tinyPng, CancelToken()));
    expect(ctx.current, isNull);
  });

  fakeTest('TC-ONB-041 네트워크 실패는 컨텍스트를 유지해 다시 시도할 수 있다', (async) {
    final h = OnboardingHarness();
    h.adapter.on('POST', signupUploadsPath, [
      const FakeResponse.fault(FakeFault.disconnect),
    ]);
    final ctx = SignUpContext()..begin(kakaoCredentials);
    final s = SignUpSubmitter(useCase: h.signUp, context: ctx);
    final p = start(async, s.submit(tinyPng, CancelToken()));
    advance(async, const Duration(seconds: 3));
    expect(p.value, isA<SignatureSubmitFailed>());
    expect(ctx.current, isNotNull);
  });
}
