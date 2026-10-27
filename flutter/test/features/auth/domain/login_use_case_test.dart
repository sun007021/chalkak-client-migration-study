import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/auth_repository.dart';
import 'package:chalkak/features/auth/domain/login_failure.dart';
import 'package:chalkak/features/auth/domain/login_use_case.dart';
import 'package:chalkak/features/auth/domain/push_registrar.dart';
import 'package:chalkak/features/auth/domain/social_login_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart';

const _abcHash =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

class _Rig {
  _Rig({Session? session, List<String>? nonces, AuthRepository? repository})
    : http = AuthHttpHarness(session: session) {
    nonceGen = FakeNonceGenerator(nonces);
    useCase = LoginUseCase(
      socialLogin: kakao,
      nonceGenerator: nonceGen,
      repository: repository ?? ApiAuthRepository(client: http.client),
      sessions: http.sessions,
      cleaner: cleaner,
      pushRegistrar: push,
    );
  }

  final AuthHttpHarness http;
  final FakeSocialLoginClient kakao = FakeSocialLoginClient();
  final FakeUserDataCleaner cleaner = FakeUserDataCleaner();
  final _RecordingPush push = _RecordingPush();
  late final FakeNonceGenerator nonceGen;
  late final LoginUseCase useCase;

  Future<LoginOutcome> login({CancelToken? cancel}) {
    push.store = http.store;
    return useCase.loginWithKakao(cancelToken: cancel);
  }

  LoginFailure failure(LoginOutcome o) => (o as LoginFailed).failure;
}

class _RecordingPush implements PushRegistrar {
  int calls = 0;
  Object? error;
  Session? sessionSeen;
  late FakeTokenStore store;

  @override
  Future<void> registerCurrentDevice() async {
    calls++;
    sessionSeen = store.current;
    final e = error;
    if (e != null) throw e;
  }
}

void main() {
  group('성공·가입 필요', () {
    test(
      'TC-AUTH-004 SDK에는 해시 nonce, 서버에는 원문 rawNonce를 쓰며 섞이지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig(nonces: ['abc']);
        r.http.onSocialLogin('auth/social-login__login-success.json');
        await r.login();
        expect(r.kakao.noncesReceived, [_abcHash]);
        expect(r.http.adapter.requests.single.jsonBody!['rawNonce'], 'abc');
        expect(
          r.http.adapter.requests.single.jsonBody!['idToken'],
          'kakao-id-token-1',
        );
      }),
    );

    test(
      'TC-AUTH-002 버튼을 누를 때마다 새 rawNonce를 만든다',
      () => atFixtureNow(() async {
        final r = _Rig(nonces: ['n-1', 'n-2']);
        r.http.onSocialLogin('auth/social-login__unauthorized.json');
        await r.login();
        await r.login();
        expect(r.nonceGen.calls, 2);
      }),
    );

    test(
      'TC-AUTH-007 TC-AUTH-008 LOGIN_SUCCESS면 세션 6종을 저장하고 푸시 등록을 시작한다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.onSocialLogin('auth/social-login__login-success.json');
        final outcome = await r.login();
        expect(outcome, isA<LoginSucceeded>());
        final saved = r.http.store.current!;
        expect(saved.userId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        expect(saved.accessToken, 'fixture-access-token-1');
        expect(saved.refreshToken, 'fixture-refresh-token-1');
        expect(
          saved.accessTokenExpiresAt,
          t0.add(const Duration(seconds: 900)),
        );
        expect(
          saved.refreshTokenExpiresAt,
          t0.add(const Duration(seconds: 2592000)),
        );
        expect(saved.isGuest, isFalse);
        expect(r.http.store.writes, hasLength(1));
        expect(r.push.calls, 1);
        expect(
          r.push.sessionSeen?.userId,
          saved.userId,
          reason: '세션을 저장한 뒤에 등록한다',
        );
      }),
    );

    test(
      'TC-AUTH-008 푸시 등록이 실패해도 로그인은 성공이다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.push.error = Exception('fcm');
        r.http.onSocialLogin('auth/social-login__login-success.json');
        expect(await r.login(), isA<LoginSucceeded>());
      }),
    );

    test(
      'TC-AUTH-034 게스트 상태에서 로그인하면 게스트 플래그가 사라지고 회원 세션이 된다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionGuest());
        r.http.onSocialLogin('auth/social-login__login-success.json');
        await r.login();
        expect(r.http.store.current!.isGuest, isFalse);
        expect(r.http.store.current!.accessToken, 'fixture-access-token-1');
      }),
    );

    test(
      'TC-AUTH-057 정지 회원도 LOGIN_SUCCESS면 별도 안내 없이 성공으로 끝난다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.onSocialLogin('auth/social-login__login-success.json');
        final outcome = await r.login();
        expect(outcome, isA<LoginSucceeded>());
        expect(r.http.adapter.requests, hasLength(1), reason: '추가 호출·안내 없음');
      }),
    );

    test(
      'TC-AUTH-010 SIGN_UP_REQUIRED면 토큰을 저장하지 않고 idToken·rawNonce를 돌려준다',
      () => atFixtureNow(() async {
        final r = _Rig(nonces: ['raw-x']);
        r.kakao.succeedWith('id-token-x');
        r.http.onSocialLogin('auth/social-login__sign-up-required.json');
        final outcome = await r.login();
        final c = (outcome as LoginSignUpRequired).credentials;
        expect(c.idToken, 'id-token-x');
        expect(c.rawNonce, 'raw-x');
        expect(r.http.store.writes, isEmpty);
        expect(r.http.store.current, isNull);
        expect(r.push.calls, 0);
      }),
    );

    test(
      'TC-AUTH-010 가입 필요 값은 문자열화해도 토큰이 드러나지 않는다(로그 금지)',
      () => atFixtureNow(() async {
        final r = _Rig(nonces: ['raw-secret']);
        r.kakao.succeedWith('id-secret');
        r.http.onSocialLogin('auth/social-login__sign-up-required.json');
        final c = ((await r.login()) as LoginSignUpRequired).credentials;
        expect('$c', isNot(contains('id-secret')));
        expect('$c', isNot(contains('raw-secret')));
        expect(r.http.logs.all, isNot(contains('id-secret')));
        expect(r.http.logs.all, isNot(contains('raw-secret')));
      }),
    );
  });

  group('SDK 오류 (서버 호출 0건)', () {
    test(
      'TC-AUTH-013 사용자 취소는 LoginCancelled이고 서버를 부르지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.kakao.failWith(const SocialLoginCancelledException());
        expect(await r.login(), isA<LoginCancelled>());
        expect(r.http.adapter.requests, isEmpty);
      }),
    );

    test(
      'TC-AUTH-018 idToken이 없으면 설정 오류이고 서버 호출 0건',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.kakao.failWith(const SocialLoginMissingIdTokenException());
        expect(r.failure(await r.login()).kind, LoginFailureKind.config);
        expect(r.http.adapter.requests, isEmpty);
      }),
    );

    test(
      'TC-AUTH-019 SDK 일반 실패는 kakaoFailed이고 서버 호출 0건',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.kakao.failWith(const SocialLoginFailedException('x'));
        expect(r.failure(await r.login()).kind, LoginFailureKind.kakaoFailed);
        expect(r.http.adapter.requests, isEmpty);
      }),
    );

    test(
      'TC-AUTH-019 예상 밖 예외도 kakaoFailed로 정리한다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.kakao.failWith(StateError('boom'));
        expect(r.failure(await r.login()).kind, LoginFailureKind.kakaoFailed);
      }),
    );
  });

  group('서버 오류 분류', () {
    Future<LoginFailure> failWithFixture(String fixture) async {
      final r = _Rig();
      r.http.onSocialLogin(fixture);
      final f = r.failure(await r.login());
      expect(r.http.store.writes, isEmpty);
      expect(r.push.calls, 0);
      return f;
    }

    test(
      'TC-AUTH-011 알 수 없는 status는 invalidResponse',
      () => atFixtureNow(() async {
        expect(
          (await failWithFixture('auth/social-login__unknown-status.json'))
              .kind,
          LoginFailureKind.invalidResponse,
        );
      }),
    );

    test(
      'TC-AUTH-012 토큰 누락은 invalidResponse이고 세션을 저장하지 않는다',
      () => atFixtureNow(() async {
        expect(
          (await failWithFixture(
            'auth/social-login__login-success-missing-token.json',
          )).kind,
          LoginFailureKind.invalidResponse,
        );
      }),
    );

    test(
      'TC-AUTH-020 401은 kakaoAccount이고 refresh를 부르지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.onSocialLogin('auth/social-login__unauthorized.json');
        expect(r.failure(await r.login()).kind, LoginFailureKind.kakaoAccount);
        expect(r.http.adapter.count('POST', AuthHttpHarness.refreshPath), 0);
      }),
    );

    test(
      'TC-AUTH-020 다음 시도는 새 rawNonce와 새 idToken으로 처음부터 한다',
      () => atFixtureNow(() async {
        final r = _Rig(nonces: ['raw-1', 'raw-2']);
        var n = 0;
        r.kakao.respond = (_) => 'id-token-${++n}';
        r.http.onSocialLogin('auth/social-login__unauthorized.json');
        await r.login();
        await r.login();
        final bodies = r.http.adapter.requests.map((q) => q.jsonBody!).toList();
        expect(bodies.map((b) => b['rawNonce']), ['raw-1', 'raw-2']);
        expect(bodies.map((b) => b['idToken']), ['id-token-1', 'id-token-2']);
        expect(r.kakao.noncesReceived.toSet(), hasLength(2));
      }),
    );

    test(
      'TC-AUTH-021 403은 forbidden이고 서버 message를 그대로 담는다',
      () => atFixtureNow(() async {
        final f = await failWithFixture(
          'auth/social-login__forbidden-banned.json',
        );
        expect(f.kind, LoginFailureKind.forbidden);
        expect(
          f.serverMessage,
          (Fixture.load('auth/social-login__forbidden-banned.json')
              as Map)['message'],
        );
      }),
    );

    test(
      'TC-AUTH-021 403을 자동 재시도하지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.onSocialLogin('auth/social-login__forbidden-banned.json');
        await r.login();
        expect(
          r.http.adapter.count('POST', AuthHttpHarness.socialLoginPath),
          1,
        );
      }),
    );

    test(
      'TC-AUTH-022 탈퇴한 차단 계정도 서버 message를 담는다',
      () => atFixtureNow(() async {
        final f = await failWithFixture(
          'auth/social-login__forbidden-withdrawn-banned.json',
        );
        expect(f.kind, LoginFailureKind.forbidden);
        expect(
          f.serverMessage,
          (Fixture.load('auth/social-login__forbidden-withdrawn-banned.json')
              as Map)['message'],
        );
      }),
    );

    test(
      'TC-AUTH-023 400(authorizationCode)은 generic이다',
      () => atFixtureNow(() async {
        expect(
          (await failWithFixture(
            'auth/social-login__bad-request-authcode.json',
          )).kind,
          LoginFailureKind.generic,
        );
      }),
    );

    test(
      'TC-AUTH-024 500은 generic이고 요청은 1회뿐이다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.onSocialLogin('auth/social-login__internal-error.json');
        expect(r.failure(await r.login()).kind, LoginFailureKind.generic);
        expect(
          r.http.adapter.count('POST', AuthHttpHarness.socialLoginPath),
          1,
        );
      }),
    );

    test(
      'TC-AUTH-025 연결 실패는 network이고 요청은 1회뿐이다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
          const FakeResponse.fault(FakeFault.disconnect),
        ]);
        expect(r.failure(await r.login()).kind, LoginFailureKind.network);
        expect(
          r.http.adapter.count('POST', AuthHttpHarness.socialLoginPath),
          1,
        );
      }),
    );

    test(
      'TC-AUTH-026 502 HTML 응답은 generic이다',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
          fixtureResponse('common/error__bad-gateway-html.json'),
        ]);
        expect(r.failure(await r.login()).kind, LoginFailureKind.generic);
      }),
    );

    test(
      'TC-AUTH-021 403인데 message가 없으면 forbidden의 serverMessage는 null(화면은 generic)',
      () => atFixtureNow(() async {
        final r = _Rig();
        r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
          FakeResponse.json(403, {'errorCode': 'FORBIDDEN'}),
        ]);
        final f = r.failure(await r.login());
        expect(f.serverMessage, isNull);
      }),
    );
  });

  group('LoginFailure.fromApiError', () {
    test('TC-AUTH-020 TC-AUTH-025 TC-AUTH-011 종류별 분류표', () {
      expect(
        LoginFailure.fromApiError(ApiErrorFactory.unauthorized()).kind,
        LoginFailureKind.kakaoAccount,
      );
      expect(
        LoginFailure.fromApiError(ApiErrorFactory.network()).kind,
        LoginFailureKind.network,
      );
      expect(
        LoginFailure.fromApiError(ApiErrorFactory.invalid()).kind,
        LoginFailureKind.invalidResponse,
      );
      expect(
        LoginFailure.fromApiError(ApiErrorFactory.server(500)).kind,
        LoginFailureKind.generic,
      );
      expect(
        LoginFailure.fromApiError(
          ApiErrorFactory.server(403, 'FORBIDDEN', '막힘'),
        ).serverMessage,
        '막힘',
      );
    });
  });

  group('계정 전환', () {
    test(
      'TC-AUTH-058 다른 계정으로 로그인하면 새 세션을 저장하기 전에 이전 계정 상태를 모두 폐기한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt(userId: 'account-A'));
        String? userAtClear;
        r.cleaner.onClear = () => userAtClear = r.http.store.current?.userId;
        r.http.onSocialLogin('auth/social-login__login-success.json');
        await r.login();
        expect(r.cleaner.calls, 1);
        expect(
          userAtClear,
          isNot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
          reason: '새 세션이 저장되기 전에 지운다',
        );
        expect(
          r.http.store.current!.userId,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        );
      }),
    );

    test(
      'TC-AUTH-058 같은 계정으로 다시 로그인하면 캐시를 지우지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig(
          session: sessionAt(userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        );
        r.http.onSocialLogin('auth/social-login__login-success.json');
        await r.login();
        expect(r.cleaner.calls, 0);
      }),
    );

    test(
      'TC-AUTH-058 로그인에 실패하면 이전 계정 상태를 건드리지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt(userId: 'account-A'));
        r.http.onSocialLogin('auth/social-login__internal-error.json');
        await r.login();
        expect(r.cleaner.calls, 0);
        expect(r.http.store.current!.userId, 'account-A');
      }),
    );
  });

  group('지연·취소', () {
    fakeTest('TC-AUTH-030 응답이 늦게 와도(백그라운드 복귀 뒤) 정상 처리된다', (async) {
      final r = _Rig();
      r.http.adapter.on('POST', AuthHttpHarness.socialLoginPath, [
        FakeResponse.json(
          200,
          Fixture.load('auth/social-login__login-success.json')
              as Map<String, dynamic>,
          delay: const Duration(seconds: 8),
        ),
      ]);
      final p = start(async, r.login());
      advance(async, const Duration(seconds: 8));
      expect(p.value, isA<LoginSucceeded>());
      expect(r.http.store.current, isNotNull);
    });

    fakeTest('TC-AUTH-031 요청 중 취소하면 세션을 저장하지 않고 오류도 없다(LoginCancelled)', (
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
      final cancel = CancelToken();
      final p = start(async, r.login(cancel: cancel));
      advance(async, const Duration(seconds: 1));
      cancel.cancel();
      advance(async, const Duration(seconds: 5));
      expect(p.value, isA<LoginCancelled>());
      expect(r.http.store.writes, isEmpty);
      expect(r.push.calls, 0);
    });

    test('TC-AUTH-031 응답은 왔지만 저장 직전에 취소됐으면 저장하지 않는다', () async {
      final cancel = CancelToken();
      final repo = FakeAuthRepository()
        ..onSocialLogin = () {
          cancel.cancel();
          return SocialLoginSucceeded(sessionAt());
        };
      final r = _Rig(repository: repo);
      expect(await r.login(cancel: cancel), isA<LoginCancelled>());
      expect(r.http.store.writes, isEmpty);
      expect(r.push.calls, 0);
    });
  });

  group('저장소 실패', () {
    test('세션 저장에 실패하면 던지지 않고 일반 실패로 돌려주며 푸시 등록을 하지 않는다', () async {
      final r = _Rig();
      r.http.onSocialLogin('auth/social-login__login-success.json');
      r.http.store.writeError = StateError('keystore');
      final outcome = await r.login();
      expect(r.failure(outcome).kind, LoginFailureKind.generic);
      expect(r.push.calls, 0);
    });
  });
}

/// ApiError 생성 단축(테스트 전용).
abstract final class ApiErrorFactory {
  static ApiError unauthorized() => ApiError.fromErrorResponse(
    401,
    '{"errorCode":"UNAUTHORIZED","message":"m"}',
  );
  static ApiError network() => ApiError.network();
  static ApiError invalid() => ApiError.invalidResponse();
  static ApiError server(int status, [String? code, String? message]) =>
      ApiError.fromErrorResponse(
        status,
        code == null ? null : '{"errorCode":"$code","message":"$message"}',
      );
}
