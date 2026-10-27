import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/test_ids.dart';
import 'package:chalkak/features/auth/domain/social_login_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart';
import '../../../support/auth_fakes.dart';
import '../../../support/fixtures.dart';

Future<AppHarness> _openLogin(WidgetTester tester) async {
  final h = AppHarness();
  await pumpApp(tester, h);
  expect(byId(TestIds.loginRoot), findsOneWidget);
  return h;
}

void main() {
  widgetTest('TC-AUTH-001 태그라인, 카카오 버튼, 게스트 링크가 보이고 Apple·Google 버튼은 없다', (
    tester,
  ) async {
    await _openLogin(tester);
    expect(
      find.descendant(
        of: byId(TestIds.loginTagline),
        matching: find.text(Copy.authLoginTagline),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(TestIds.loginKakaoButton),
        matching: find.text(Copy.authLoginKakao),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(TestIds.loginGuestButton),
        matching: find.text(Copy.authLoginGuest),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Apple'), findsNothing);
    expect(find.textContaining('Google'), findsNothing);
    expect(find.textContaining('구글'), findsNothing);
    expect(find.textContaining('애플'), findsNothing);
    expect(byId(TestIds.loginLoading), findsNothing);
    expect(byId(TestIds.loginErrorDialog), findsNothing);
  });

  widgetTest('TC-AUTH-001 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _openLogin(tester);
    for (final id in [
      TestIds.loginRoot,
      TestIds.loginTagline,
      TestIds.loginKakaoButton,
      TestIds.loginGuestButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('TC-AUTH-027 카카오 버튼을 3회 연타하면 SDK 1회, 진행 표시가 보이고 버튼은 비활성이다', (
    tester,
  ) async {
    final h = await _openLogin(tester);
    final sdk = Completer<String>();
    h.kakao.respond = (_) => sdk.future;
    h.http.onSocialLogin('auth/social-login__login-success.json');
    expect(isEnabled(tester, TestIds.loginKakaoButton), isTrue);
    for (var i = 0; i < 3; i++) {
      await tester.tap(byId(TestIds.loginKakaoButton));
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(h.kakao.calls, 1);
    expect(byId(TestIds.loginLoading), findsOneWidget);
    expect(isEnabled(tester, TestIds.loginKakaoButton), isFalse);
    expect(isEnabled(tester, TestIds.loginGuestButton), isFalse);
    sdk.complete('id-token');
    await settleUi(tester);
    expect(h.http.adapter.count('POST', AuthHttpHarness.socialLoginPath), 1);
  });

  widgetTest('TC-AUTH-008 LOGIN_SUCCESS면 홈으로 이동한다', (tester) async {
    final h = await _openLogin(tester);
    h.http.onSocialLogin('auth/social-login__login-success.json');
    await tester.tap(byId(TestIds.loginKakaoButton));
    await settleUi(tester);
    expect(byId(TestIds.homeRoot), findsOneWidget);
    expect(byId(TestIds.loginRoot), findsNothing);
    expect(h.push.calls, 1);
  });

  widgetTest('TC-AUTH-010 SIGN_UP_REQUIRED면 약관 화면(자리표시자)으로 이동한다', (
    tester,
  ) async {
    final h = await _openLogin(tester);
    h.http.onSocialLogin('auth/social-login__sign-up-required.json');
    await tester.tap(byId(TestIds.loginKakaoButton));
    await settleUi(tester);
    expect(byId(TestIds.termsRoot), findsOneWidget);
    expect(byId(TestIds.loginRoot), findsNothing);
    expect(h.http.store.current, isNull);
  });

  widgetTest('TC-AUTH-032 게스트 링크는 서버 호출 없이 홈으로 이동한다', (tester) async {
    final h = await _openLogin(tester);
    await tester.tap(byId(TestIds.loginGuestButton));
    await settleUi(tester);
    expect(byId(TestIds.homeRoot), findsOneWidget);
    expect(h.http.adapter.requests, isEmpty);
    expect(h.http.store.current!.isGuest, isTrue);
  });

  widgetTest('TC-AUTH-013 사용자 취소면 오류 알림 없이 버튼이 다시 눌린다', (tester) async {
    final h = await _openLogin(tester);
    h.kakao.failWith(const SocialLoginCancelledException());
    await tester.tap(byId(TestIds.loginKakaoButton));
    await settleUi(tester);
    expect(byId(TestIds.loginErrorDialog), findsNothing);
    expect(isEnabled(tester, TestIds.loginKakaoButton), isTrue);
    expect(byId(TestIds.loginLoading), findsNothing);
  });

  widgetTest('TC-AUTH-024 TC-AUTH-018 서버 오류는 알림으로 보이고 확인하면 닫혀 재시도할 수 있다', (
    tester,
  ) async {
    final h = await _openLogin(tester);
    h.http.onSocialLogin('auth/social-login__internal-error.json');
    await tester.tap(byId(TestIds.loginKakaoButton));
    await settleUi(tester);
    expect(byId(TestIds.loginErrorDialog), findsOneWidget);
    expect(
      find.descendant(
        of: byId(TestIds.loginErrorDialog),
        matching: find.text(Copy.authLoginErrorGeneric),
      ),
      findsOneWidget,
    );
    await tester.tap(byId(TestIds.loginErrorDialogConfirmButton));
    await settleUi(tester);
    expect(byId(TestIds.loginErrorDialog), findsNothing);
    expect(isEnabled(tester, TestIds.loginKakaoButton), isTrue);
  });

  widgetTest('TC-AUTH-029 같은 오류가 연달아 나와도 알림이 매번 다시 뜬다', (tester) async {
    final h = await _openLogin(tester);
    h.http.onSocialLogin('auth/social-login__internal-error.json');
    for (var i = 0; i < 2; i++) {
      await tester.tap(byId(TestIds.loginKakaoButton));
      await settleUi(tester);
      expect(
        byId(TestIds.loginErrorDialog),
        findsOneWidget,
        reason: '${i + 1}번째',
      );
      await tester.tap(byId(TestIds.loginErrorDialogConfirmButton));
      await settleUi(tester);
      expect(byId(TestIds.loginErrorDialog), findsNothing);
    }
    expect(h.kakao.calls, 2);
  });

  widgetTest('TC-AUTH-021 403이면 서버 message를 알림에 그대로 보인다', (tester) async {
    final h = await _openLogin(tester);
    h.http.onSocialLogin('auth/social-login__forbidden-banned.json');
    await tester.tap(byId(TestIds.loginKakaoButton));
    await settleUi(tester);
    final message =
        (Fixture.load('auth/social-login__forbidden-banned.json')
                as Map)['message']!
            as String;
    expect(
      find.descendant(
        of: byId(TestIds.loginErrorDialog),
        matching: find.text(message),
      ),
      findsOneWidget,
    );
  });

  widgetTest(
    'TC-AUTH-031 요청 중 화면을 벗어나도(로그인 성공 전 게스트 이동 등) 늦은 응답이 세션을 만들지 않는다',
    (tester) async {
      final h = await _openLogin(tester);
      final sdk = Completer<String>();
      h.kakao.respond = (_) => sdk.future;
      h.http.onSocialLogin('auth/social-login__login-success.json');
      await tester.tap(byId(TestIds.loginKakaoButton));
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pumpWidget(const SizedBox.shrink()); // 화면 제거 = dispose
      sdk.complete('id-token');
      await settleUi(tester);
      expect(h.http.store.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
}
