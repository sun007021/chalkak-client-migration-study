import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart';

const _social = AuthHttpHarness.socialLoginPath;

Future<SocialLoginResponse> _login(AuthHttpHarness h, {CancelToken? cancel}) =>
    ApiAuthRepository(client: h.client).socialLogin(
      idToken: 'kakao-id-token',
      rawNonce: 'raw-nonce',
      cancelToken: cancel,
    );

Future<ApiError> _loginError(AuthHttpHarness h) async {
  try {
    await _login(h);
  } on ApiError catch (e) {
    return e;
  }
  fail('ApiError가 와야 한다');
}

void main() {
  group('social-login 요청 모양(C)', () {
    test(
      'TC-AUTH-005 바디는 {provider, idToken, rawNonce}뿐이고 authorizationCode가 없다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__login-success.json');
        await _login(h);
        final r = h.adapter.requests.single;
        expect(r.method, 'POST');
        expect(r.path, _social);
        expect(r.jsonBody, {
          'provider': 'KAKAO',
          'idToken': 'kakao-id-token',
          'rawNonce': 'raw-nonce',
        });
        expect(r.jsonBody!.containsKey('authorizationCode'), isFalse);
      }),
    );

    test(
      'TC-AUTH-005 저장된 세션이 있어도 Authorization 헤더를 붙이지 않는다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt())
          ..onSocialLogin('auth/social-login__login-success.json');
        await _login(h);
        expect(h.adapter.requests.single.hasAuthorization, isFalse);
      }),
    );
  });

  group('LOGIN_SUCCESS / SIGN_UP_REQUIRED 해석(C)', () {
    test(
      'TC-AUTH-006 TC-AUTH-007 LOGIN_SUCCESS를 읽고 만료 시각은 응답 초에서 계산한다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__login-success.json');
        final body =
            Fixture.load('auth/social-login__login-success.json') as Map;
        final res = await _login(h);
        final s = (res as SocialLoginSucceeded).session;
        expect(s.userId, body['userId']);
        expect(s.accessToken, body['accessToken']);
        expect(s.refreshToken, body['refreshToken']);
        expect(
          s.accessTokenExpiresAt,
          t0.add(Duration(seconds: body['expiresIn']! as int)),
        );
        expect(
          s.refreshTokenExpiresAt,
          t0.add(Duration(seconds: body['refreshTokenExpiresIn']! as int)),
        );
        expect(s.isGuest, isFalse);
      }),
    );

    test(
      'TC-AUTH-007 수명 값을 코드에 고정하지 않는다(expiresIn 60이면 now+60초)',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness();
        h.adapter.on('POST', _social, [
          FakeResponse.json(200, {
            'status': 'LOGIN_SUCCESS',
            'userId': 'u1',
            'accessToken': 'a',
            'expiresIn': 60,
            'refreshToken': 'r',
            'refreshTokenExpiresIn': 120,
          }),
        ]);
        final s = ((await _login(h)) as SocialLoginSucceeded).session;
        expect(s.accessTokenExpiresAt, t0.add(const Duration(seconds: 60)));
        expect(s.refreshTokenExpiresAt, t0.add(const Duration(seconds: 120)));
      }),
    );

    test(
      'TC-AUTH-009 SIGN_UP_REQUIRED는 status만 있어도 오류가 아니다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__sign-up-required.json');
        expect(await _login(h), isA<SocialLoginSignUpRequired>());
      }),
    );

    test(
      'TC-AUTH-011 알 수 없는 status는 invalidResponse',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__unknown-status.json');
        expect((await _loginError(h)).isInvalidResponse, isTrue);
      }),
    );

    test(
      'TC-AUTH-012 LOGIN_SUCCESS인데 토큰이 빠지면 invalidResponse이고 세션을 저장하지 않는다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin(
            'auth/social-login__login-success-missing-token.json',
          );
        expect((await _loginError(h)).isInvalidResponse, isTrue);
        expect(h.store.writes, isEmpty);
      }),
    );
  });

  group('social-login 오류 응답(C)', () {
    test(
      'TC-AUTH-020 401 UNAUTHORIZED는 refresh를 시도하지 않는다(세션이 있어도)',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt())
          ..onSocialLogin('auth/social-login__unauthorized.json');
        final e = await _loginError(h);
        expect(e.isUnauthorized, isTrue);
        expect(h.adapter.count('POST', AuthHttpHarness.refreshPath), 0);
        expect(h.adapter.count('POST', _social), 1);
        expect(h.store.current, isNotNull, reason: '세션을 지우지 않는다');
      }),
    );

    for (final (tc, fixture) in [
      ('TC-AUTH-021', 'auth/social-login__forbidden-banned.json'),
      ('TC-AUTH-022', 'auth/social-login__forbidden-withdrawn-banned.json'),
    ]) {
      test(
        '$tc 403 FORBIDDEN은 서버 message를 보존하고 1회만 보낸다',
        () => atFixtureNow(() async {
          final h = AuthHttpHarness()..onSocialLogin(fixture);
          final e = await _loginError(h);
          expect(e.status, 403);
          expect(e.errorCode, ApiErrorCode.forbidden);
          expect(e.message, (Fixture.load(fixture) as Map)['message']);
          expect(h.adapter.count('POST', _social), 1);
        }),
      );
    }

    test(
      'TC-AUTH-023 400 BUSINESS_ERROR(authorizationCode)는 businessError로 읽는다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__bad-request-authcode.json');
        final e = await _loginError(h);
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.businessError);
      }),
    );

    test(
      'TC-AUTH-024 500 INTERNAL_ERROR에도 요청은 정확히 1회(자동 재시도 금지)',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness()
          ..onSocialLogin('auth/social-login__internal-error.json');
        final e = await _loginError(h);
        expect(e.status, 500);
        expect(h.adapter.count('POST', _social), 1);
      }),
    );

    test(
      'TC-AUTH-025 연결 실패는 network 오류이고 요청은 1회뿐이다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness();
        h.adapter.on('POST', _social, [
          const FakeResponse.fault(FakeFault.disconnect),
        ]);
        final e = await _loginError(h);
        expect(e.isNetwork, isTrue);
        expect(h.adapter.count('POST', _social), 1);
      }),
    );

    fakeTest('TC-AUTH-025 응답 타임아웃도 network 오류이고 요청은 1회뿐이다', (async) {
      final h = AuthHttpHarness();
      h.adapter.on('POST', _social, [
        const FakeResponse.fault(FakeFault.timeout),
      ]);
      final p = Probe(_login(h));
      advance(async, const Duration(minutes: 1));
      expect((p.error as ApiError).isNetwork, isTrue);
      expect(h.adapter.count('POST', _social), 1);
    });

    test(
      'TC-AUTH-026 502 HTML 응답은 HTTP 상태로 분류하고 크래시하지 않는다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness();
        h.adapter.on('POST', _social, [
          fixtureResponse('common/error__bad-gateway-html.json'),
        ]);
        final e = await _loginError(h);
        expect(e.status, 502);
        expect(e.errorCode, isNull);
      }),
    );

    fakeTest('TC-AUTH-031 CancelToken을 취소하면 cancelled 오류다', (async) {
      final h = AuthHttpHarness();
      h.adapter.on('POST', _social, [
        FakeResponse.json(
          200,
          Fixture.load('auth/social-login__login-success.json')
              as Map<String, dynamic>,
          delay: const Duration(seconds: 2),
        ),
      ]);
      final cancel = CancelToken();
      final p = Probe(_login(h, cancel: cancel));
      advance(async, const Duration(seconds: 1));
      cancel.cancel();
      settle(async);
      expect((p.error as ApiError).isCancelled, isTrue);
    });
  });

  group('logout / DELETE /users/me (C)', () {
    test(
      'TC-AUTH-037 로그아웃 요청은 POST /auth/logout {refreshToken}뿐이고 Authorization이 없다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt(rt: 'rt-x'));
        h.adapter.on('POST', AuthHttpHarness.logoutPath, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await ApiAuthRepository(client: h.client).logout(refreshToken: 'rt-x');
        final r = h.adapter.requests.single;
        expect(r.jsonBody, {'refreshToken': 'rt-x'});
        expect(r.hasAuthorization, isFalse);
      }),
    );

    test(
      'TC-AUTH-036 로그아웃 500은 예외로 올라오되 재시도하지 않는다(무시는 유스케이스 몫)',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness();
        h.adapter.on('POST', AuthHttpHarness.logoutPath, [
          fixtureResponse('auth/logout__internal-error.json'),
        ]);
        await expectLater(
          ApiAuthRepository(client: h.client).logout(refreshToken: 'rt'),
          throwsA(isA<ApiError>()),
        );
        expect(h.adapter.count('POST', AuthHttpHarness.logoutPath), 1);
      }),
    );

    test(
      'TC-AUTH-043 DELETE /users/me는 본문 없이 Authorization과 함께 나가고 204가 성공이다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt());
        h.adapter.on('DELETE', AuthHttpHarness.deleteMePath, [
          fixtureResponse('auth/users-me__delete-no-content.json'),
        ]);
        await ApiAuthRepository(client: h.client).deleteAccount();
        final r = h.adapter.requests.single;
        expect(r.body == null || r.body!.isEmpty, isTrue);
        expect(r.header('authorization'), 'Bearer at1');
      }),
    );

    test(
      'TC-AUTH-044 DELETE가 500이면 ApiError로 올라온다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt());
        h.adapter.on('DELETE', AuthHttpHarness.deleteMePath, [
          fixtureResponse('auth/users-me__delete-internal-error.json'),
        ]);
        await expectLater(
          ApiAuthRepository(client: h.client).deleteAccount(),
          throwsA(isA<ApiError>().having((e) => e.status, 'status', 500)),
        );
      }),
    );

    test(
      'TC-AUTH-045 DELETE 401이면 refresh 후 새 토큰으로 1회 재전송하고 204로 끝난다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt());
        h.adapter
          ..on('DELETE', AuthHttpHarness.deleteMePath, [
            fixtureResponse('auth/users-me__delete-unauthorized.json'),
            fixtureResponse('auth/users-me__delete-no-content.json'),
          ])
          ..on('POST', AuthHttpHarness.refreshPath, [
            fixtureResponse('auth/refresh__success.json'),
          ]);
        await ApiAuthRepository(client: h.client).deleteAccount();
        expect(h.adapter.count('DELETE', AuthHttpHarness.deleteMePath), 2);
        expect(h.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
        final second = h.adapter
            .where('DELETE', AuthHttpHarness.deleteMePath)
            .last;
        expect(second.header('authorization'), isNot('Bearer at1'));
      }),
    );

    test(
      'TC-AUTH-045 refresh가 5xx로 실패하면 탈퇴는 실패하고 세션은 유지된다',
      () => atFixtureNow(() async {
        final h = AuthHttpHarness(session: sessionAt());
        h.adapter
          ..on('DELETE', AuthHttpHarness.deleteMePath, [
            fixtureResponse('auth/users-me__delete-unauthorized.json'),
          ])
          ..on('POST', AuthHttpHarness.refreshPath, [
            fixtureResponse('auth/refresh__internal-error.json'),
          ]);
        await expectLater(
          ApiAuthRepository(client: h.client).deleteAccount(),
          throwsA(isA<ApiError>()),
        );
        expect(h.store.current, isNotNull);
      }),
    );
  });
}
