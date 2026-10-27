import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/login_use_case.dart';
import 'package:chalkak/features/auth/domain/session_use_cases.dart';
import 'package:chalkak/features/auth/domain/social_login_client.dart';
import 'package:chalkak/features/auth/presentation/login_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart';

class _Rig {
  _Rig({FakeTokenStore? store}) : http = AuthHttpHarness() {
    final sessions = store == null
        ? http.sessions
        : SessionManager(store: store);
    vm = LoginViewModel(
      loginUseCase: LoginUseCase(
        socialLogin: kakao,
        nonceGenerator: FakeNonceGenerator(),
        repository: ApiAuthRepository(client: http.client),
        sessions: http.sessions,
        cleaner: FakeUserDataCleaner(),
        pushRegistrar: FakePushRegistrar(),
      ),
      enterGuest: EnterGuestUseCase(sessions: sessions),
    );
    vm.events.listen(events.add);
  }

  final AuthHttpHarness http;
  final FakeSocialLoginClient kakao = FakeSocialLoginClient();
  final List<LoginEvent> events = [];
  late final LoginViewModel vm;

  LoginState get state => vm.state;

  void press(FakeAsync async) {
    vm.onKakaoPressed();
    settle(async);
  }
}

void main() {
  fakeTest('초기 상태는 진행 중 아님, 오류 없음', (async) {
    final r = _Rig();
    expect(r.state.isSubmitting, isFalse);
    expect(r.state.error, isNull);
  });

  fakeTest('TC-AUTH-027 카카오 버튼을 3회 연타해도 SDK 1회, 서버 1회이고 진행 중에는 비활성이다', (async) {
    final r = _Rig();
    final sdk = Completer<String>();
    r.kakao.respond = (_) => sdk.future;
    r.http.onSocialLogin('auth/social-login__login-success.json');
    r.vm.onKakaoPressed();
    r.vm.onKakaoPressed();
    r.vm.onKakaoPressed();
    settle(async);
    expect(r.state.isSubmitting, isTrue);
    expect(r.kakao.calls, 1);
    sdk.complete('id-token');
    settle(async);
    expect(r.http.adapter.count('POST', AuthHttpHarness.socialLoginPath), 1);
    expect(r.kakao.calls, 1);
  });

  fakeTest('TC-AUTH-010 진행 중에는 게스트 버튼도 무시한다(중복 요청 방지)', (async) {
    final r = _Rig();
    final sdk = Completer<String>();
    r.kakao.respond = (_) => sdk.future;
    r.vm.onKakaoPressed();
    settle(async);
    r.vm.onGuestPressed();
    settle(async);
    expect(r.events, isEmpty);
    expect(r.http.store.current, isNull);
  });

  fakeTest('TC-AUTH-008 LOGIN_SUCCESS면 NavigateToMain 이벤트를 낸다', (async) {
    final r = _Rig();
    r.http.onSocialLogin('auth/social-login__login-success.json');
    r.press(async);
    expect(r.events.single, isA<NavigateToMain>());
    expect(r.state.error, isNull);
  });

  fakeTest('TC-AUTH-028 성공 후 화면 전환이 끝나면 resetSubmission으로 다시 제출할 수 있다', (
    async,
  ) {
    final r = _Rig();
    r.http.onSocialLogin('auth/social-login__login-success.json');
    r.press(async);
    expect(r.state.isSubmitting, isTrue, reason: '전환 중 재제출 방지');
    r.vm.onKakaoPressed();
    settle(async);
    expect(r.kakao.calls, 1);
    r.vm.resetSubmission();
    expect(r.state.isSubmitting, isFalse);
    r.press(async);
    expect(r.kakao.calls, 2);
  });

  fakeTest('TC-AUTH-010 SIGN_UP_REQUIRED면 약관 이동 이벤트로 idToken·rawNonce를 전달한다', (
    async,
  ) {
    final r = _Rig();
    r.kakao.succeedWith('id-token-9');
    r.http.onSocialLogin('auth/social-login__sign-up-required.json');
    r.press(async);
    final e = r.events.single as NavigateToTerms;
    expect(e.credentials.idToken, 'id-token-9');
    expect(e.credentials.rawNonce, 'raw-nonce-1');
    expect(r.http.store.writes, isEmpty);
  });

  fakeTest('TC-AUTH-013 사용자 취소면 오류 문구 없이 초기 상태(버튼 활성)로 돌아간다', (async) {
    final r = _Rig();
    r.kakao.failWith(const SocialLoginCancelledException());
    r.press(async);
    expect(r.state.error, isNull);
    expect(r.state.isSubmitting, isFalse);
    expect(r.events, isEmpty);
    r.press(async);
    expect(r.kakao.calls, 2, reason: '버튼이 다시 눌린다');
  });

  group('오류 문구', () {
    void expectMessage(
      String name,
      String Function() message,
      void Function(_Rig r) arrange,
    ) {
      fakeTest(name, (async) {
        final r = _Rig();
        arrange(r);
        r.press(async);
        expect(r.state.error?.message, message());
        expect(r.state.isSubmitting, isFalse, reason: '오류 뒤에는 재시도할 수 있다');
        expect(r.events, isEmpty);
      });
    }

    expectMessage(
      'TC-AUTH-018 idToken 없음은 설정 오류 문구',
      () => Copy.authLoginErrorConfig,
      (r) => r.kakao.failWith(const SocialLoginMissingIdTokenException()),
    );
    expectMessage(
      'TC-AUTH-019 SDK 일반 실패는 kakao-failed 문구',
      () => Copy.authLoginErrorKakaoFailed,
      (r) => r.kakao.failWith(const SocialLoginFailedException()),
    );
    expectMessage(
      'TC-AUTH-011 알 수 없는 status는 invalid-response 문구',
      () => Copy.authLoginErrorInvalidResponse,
      (r) => r.http.onSocialLogin('auth/social-login__unknown-status.json'),
    );
    expectMessage(
      'TC-AUTH-012 토큰 누락은 invalid-response 문구',
      () => Copy.authLoginErrorInvalidResponse,
      (r) => r.http.onSocialLogin(
        'auth/social-login__login-success-missing-token.json',
      ),
    );
    expectMessage(
      'TC-AUTH-020 401은 kakao-account 문구',
      () => Copy.authLoginErrorKakaoAccount,
      (r) => r.http.onSocialLogin('auth/social-login__unauthorized.json'),
    );
    expectMessage(
      'TC-AUTH-021 403은 서버 message 그대로',
      () =>
          (Fixture.load('auth/social-login__forbidden-banned.json')
                  as Map)['message']!
              as String,
      (r) => r.http.onSocialLogin('auth/social-login__forbidden-banned.json'),
    );
    expectMessage(
      'TC-AUTH-022 탈퇴한 차단 계정은 서버 message 그대로',
      () =>
          (Fixture.load('auth/social-login__forbidden-withdrawn-banned.json')
                  as Map)['message']!
              as String,
      (r) => r.http.onSocialLogin(
        'auth/social-login__forbidden-withdrawn-banned.json',
      ),
    );
    expectMessage(
      'TC-AUTH-023 400은 generic 문구',
      () => Copy.authLoginErrorGeneric,
      (r) =>
          r.http.onSocialLogin('auth/social-login__bad-request-authcode.json'),
    );
    expectMessage(
      'TC-AUTH-024 500은 generic 문구',
      () => Copy.authLoginErrorGeneric,
      (r) => r.http.onSocialLogin('auth/social-login__internal-error.json'),
    );
    expectMessage(
      'TC-AUTH-025 연결 실패는 network 문구',
      () => Copy.authLoginErrorNetwork,
      (r) => r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
        const FakeResponse.fault(FakeFault.disconnect),
      ]),
    );
    expectMessage(
      'TC-AUTH-026 502 HTML은 generic 문구',
      () => Copy.authLoginErrorGeneric,
      (r) => r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
        fixtureResponse('common/error__bad-gateway-html.json'),
      ]),
    );
  });

  fakeTest('TC-AUTH-029 같은 오류가 연달아 나와도 매번 새 id라 다시 표시된다', (async) {
    final r = _Rig();
    r.http.onSocialLogin('auth/social-login__internal-error.json');
    r.press(async);
    final first = r.state.error!;
    r.press(async);
    final second = r.state.error!;
    expect(second.message, first.message);
    expect(second.id, isNot(first.id));
  });

  fakeTest('TC-AUTH-018 오류 알림 확인(dismissError) 뒤에는 오류가 사라지고 재시도할 수 있다', (
    async,
  ) {
    final r = _Rig();
    r.http.onSocialLogin('auth/social-login__internal-error.json');
    r.press(async);
    r.vm.dismissError();
    expect(r.state.error, isNull);
    expect(r.state.isSubmitting, isFalse);
  });

  fakeTest('상태가 바뀔 때마다 리스너에 알린다', (async) {
    final r = _Rig();
    var n = 0;
    r.vm.addListener(() => n++);
    r.http.onSocialLogin('auth/social-login__internal-error.json');
    r.press(async);
    expect(n, greaterThanOrEqualTo(2)); // 제출 시작, 오류
  });

  fakeTest('TC-AUTH-031 요청 중 화면이 사라지면(dispose) 요청을 취소하고 오류·이벤트·저장이 없다', (
    async,
  ) {
    final r = _Rig();
    r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
      FakeResponse.json(
        200,
        Fixture.load('auth/social-login__login-success.json')
            as Map<String, dynamic>,
        delay: const Duration(seconds: 3),
      ),
    ]);
    r.vm.onKakaoPressed();
    advance(async, const Duration(seconds: 1));
    r.vm.dispose();
    advance(async, const Duration(seconds: 10));
    expect(r.events, isEmpty);
    expect(r.http.store.writes, isEmpty);
  });

  group('게스트', () {
    fakeTest('TC-AUTH-032 게스트 버튼은 서버 호출 없이 게스트 세션을 저장하고 홈 이동 이벤트를 낸다', (async) {
      final r = _Rig();
      r.vm.onGuestPressed();
      settle(async);
      expect(r.http.adapter.requests, isEmpty);
      expect(r.http.store.current!.isGuest, isTrue);
      expect(r.events.single, isA<NavigateToMain>());
    });

    fakeTest(
      'TC-AUTH-032 게스트 저장이 실패하면(REQ-AUTH-020) 로그인 화면에 머물고 guest 오류 문구를 보인다',
      (async) {
        final store = _FailingWriteStore();
        final r = _Rig(store: store);
        r.vm.onGuestPressed();
        settle(async);
        expect(r.state.error?.message, Copy.authLoginErrorGuest);
        expect(r.state.isSubmitting, isFalse);
        expect(r.events, isEmpty);
      },
    );
  });
}

class _FailingWriteStore extends FakeTokenStore {
  @override
  Future<void> write(Session session) async => throw StateError('disk full');
}
