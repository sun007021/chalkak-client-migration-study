import 'package:chalkak/app/app_routes.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/test_ids.dart';
import 'package:chalkak/features/onboarding/presentation/onboarding_test_ids.dart';
import 'package:chalkak/features/signature/presentation/signature_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/auth_fakes.dart';
import '../support/onboarding_fakes.dart';

/// 로그인(SIGN_UP_REQUIRED) -> 약관 -> 사인 그리기 -> 미리보기 -> 가입 완료의 라우팅 연결.
/// 각 단계의 세부 동작은 기능별 테스트가 맡고, 여기서는 화면 사이 이동과 백스택만 본다.

AppHarness _harness() {
  final h = AppHarness();
  h.http.onSocialLogin('auth/social-login__sign-up-required.json');
  return h;
}

void _scriptSignup(AppHarness h, {List<String>? confirm}) {
  final adapter = h.http.adapter;
  adapter.on('POST', signupUploadsPath, [
    fixtureResponse('onboarding/signup-uploads__success.json'),
  ]);
  adapter.on('PUT', signupUploadPutPath, [
    fixtureResponse('onboarding/presigned-put__ok.json'),
  ]);
  adapter.on('POST', signupPath, [
    for (final f in confirm ?? ['onboarding/signup__success.json'])
      fixtureResponse(f),
  ]);
}

Future<void> _loginToTerms(WidgetTester tester, AppHarness h) async {
  await pumpApp(tester, h, frames: 60);
  await tester.tap(byId(TestIds.loginKakaoButton));
  await settleUi(tester, frames: 30);
  expect(byId(OnboardingTestIds.termsRoot), findsOneWidget);
}

Future<void> _agreeAndNext(WidgetTester tester) async {
  await tester.tap(byId(OnboardingTestIds.termsAgreeAllCheckbox));
  await settleUi(tester, frames: 3);
  await tester.tap(byId(OnboardingTestIds.termsNextButton));
  await settleUi(tester, frames: 30);
  expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
}

Future<void> _drawAndPreview(WidgetTester tester) async {
  await tester.drag(byId(SignatureTestIds.drawCanvas), const Offset(80, 30));
  await settleUi(tester, frames: 3);
  await tester.tap(byId(SignatureTestIds.drawSubmitButton));
  await settleUi(tester, frames: 30);
  expect(byId(SignatureTestIds.previewRoot), findsOneWidget);
}

void main() {
  widgetTest(
    'TC-ONB-015 TC-ONB-024 로그인 SIGN_UP_REQUIRED -> 약관 -> 그리기 -> 미리보기 -> 가입 성공이면 메인이고 가입 화면은 모두 사라진다',
    (tester) async {
      final h = _harness();
      _scriptSignup(h);
      await _loginToTerms(tester, h);
      expect(h.signUpContext.current!.idToken, 'kakao-id-token-1');
      await _agreeAndNext(tester);
      await _drawAndPreview(tester);

      await tester.tap(byId(SignatureTestIds.previewConfirmButton));
      await settleUi(tester, frames: 30);

      expect(byId(TestIds.homeRoot), findsOneWidget);
      expect(byId(OnboardingTestIds.termsRoot), findsNothing);
      expect(byId(SignatureTestIds.drawRoot), findsNothing);
      expect(byId(SignatureTestIds.previewRoot), findsNothing);
      expect(byId(TestIds.loginRoot), findsNothing);
      expect(h.signUpContext.current, isNull);
      expect(h.http.store.writes, hasLength(1));
      expect(h.push.calls, 1);
      expect(h.analytics.screenNames, [
        'login',
        'terms',
        'onboarding_signature',
        'onboarding_signature_preview',
        'home', // 메인 셸이 시작할 때 screen_view home을 보낸다(REQ-NAV).
      ]);
    },
  );

  widgetTest('TC-SIGN-018 다시 그리기는 그리기 화면으로 돌아가고 이전 획은 지워져 있다', (tester) async {
    final h = _harness();
    await _loginToTerms(tester, h);
    await _agreeAndNext(tester);
    await _drawAndPreview(tester);

    await tester.tap(byId(SignatureTestIds.previewRedrawButton));
    await settleUi(tester, frames: 30);

    expect(byId(SignatureTestIds.previewRoot), findsNothing);
    expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
    expect(byId(SignatureTestIds.drawCanvasHint), findsOneWidget);
    expect(isEnabled(tester, SignatureTestIds.drawSubmitButton), isFalse);
    expect(
      h.http.adapter.requests.where((r) => r.path.contains('signup')),
      isEmpty,
    );
  });

  widgetTest('TC-ONB-035 서버가 사인을 거절하면 그리기 화면으로 돌아가 문구를 보이고 다시 그릴 수 있다', (
    tester,
  ) async {
    final h = _harness();
    _scriptSignup(h, confirm: ['onboarding/signup__invalid-signature.json']);
    await _loginToTerms(tester, h);
    await _agreeAndNext(tester);
    await _drawAndPreview(tester);

    await tester.tap(byId(SignatureTestIds.previewConfirmButton));
    await settleUi(tester, frames: 30);

    expect(byId(SignatureTestIds.previewRoot), findsNothing);
    expect(
      find.descendant(
        of: byId(SignatureTestIds.drawErrorMessage),
        matching: find.text(Copy.signErrorInvalid),
      ),
      findsOneWidget,
    );
    expect(byId(SignatureTestIds.drawCanvasHint), findsOneWidget);
    expect(h.signUpContext.current, isNotNull);
  });

  widgetTest(
    'TC-ONB-032 TC-ONB-037 가입이 차단(403)되면 로그인 화면으로 돌아가 서버 message를 한 번만 보인다',
    (tester) async {
      final h = _harness();
      _scriptSignup(h, confirm: ['onboarding/signup__forbidden-banned.json']);
      await _loginToTerms(tester, h);
      await _agreeAndNext(tester);
      await _drawAndPreview(tester);

      await tester.tap(byId(SignatureTestIds.previewConfirmButton));
      await settleUi(tester, frames: 40);

      expect(byId(TestIds.loginRoot), findsOneWidget);
      expect(byId(SignatureTestIds.previewRoot), findsNothing);
      expect(byId(SignatureTestIds.previewErrorDialog), findsNothing);
      expect(byId(TestIds.loginErrorDialog), findsOneWidget);
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.descendant(
          of: byId(TestIds.loginErrorDialog),
          matching: find.text('차단된 소셜 계정입니다.'),
        ),
        findsOneWidget,
      );
      expect(h.signUpContext.current, isNull);
    },
  );

  widgetTest('TC-ONB-017 약관에서 뒤로 가면 로그인으로 돌아가고 가입 컨텍스트는 폐기된다', (tester) async {
    final h = _harness();
    await _loginToTerms(tester, h);

    await tester.tap(byId(OnboardingTestIds.termsBackButton));
    await settleUi(tester, frames: 30);

    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(byId(OnboardingTestIds.termsRoot), findsNothing);
    expect(h.signUpContext.current, isNull);
    expect(isEnabled(tester, TestIds.loginKakaoButton), isTrue);
  });

  widgetTest('TC-ONB-046 가입 컨텍스트 없이 약관 경로로 들어오면 로그인으로 간다', (tester) async {
    final h = AppHarness();
    await pumpApp(tester, h, frames: 60);
    expect(byId(TestIds.loginRoot), findsOneWidget);

    await tester.binding.handlePushRoute(AppRoutes.terms);
    await settleUi(tester, frames: 30);
    expect(byId(OnboardingTestIds.termsRoot), findsNothing);
    expect(byId(TestIds.loginRoot), findsOneWidget);

    await tester.binding.handlePushRoute(AppRoutes.signUpPreview);
    await settleUi(tester, frames: 30);
    expect(byId(SignatureTestIds.previewRoot), findsNothing);
    expect(byId(TestIds.loginRoot), findsOneWidget);
  });
}
