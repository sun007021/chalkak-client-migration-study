import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show Probe, advance, t0;
import '../../../support/onboarding_fakes.dart';

const _pending = 'onboarding/signup__signature-processing-pending.json';
const _success = 'onboarding/signup__success.json';

Probe<SignatureSubmitOutcome> _run(
  FakeAsync async,
  OnboardingHarness h, {
  CancelToken? token,
}) => start(async, h.signUp(kakaoCredentials, tinyPng, cancelToken: token));

SignatureSubmitOutcome _await(FakeAsync async, OnboardingHarness h) =>
    resolve(async, h.signUp(kakaoCredentials, tinyPng));

SignatureFailure _failure(SignatureSubmitOutcome o) {
  expect(o, isA<SignatureSubmitFailed>(), reason: '$o');
  return (o as SignatureSubmitFailed).failure;
}

SignatureFailureKind _kind(SignatureSubmitOutcome o) => _failure(o).kind;

void main() {
  group('요청 순서와 성공 처리', () {
    fakeTest('TC-ONB-019 순서는 uploads 발급 -> presigned PUT -> social-signup이다', (
      async,
    ) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      expect(_await(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.sequence, [
        'POST $signupUploadsPath',
        'PUT $signupUploadPutPath',
        'POST $signupPath',
      ]);
      expect(h.bodyBytes(h.putRequests.single), tinyPng);
    });

    fakeTest('TC-ONB-019 발급 응답의 signupToken으로 확정한다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      _await(async, h);
      final fx = Fixture.load('onboarding/signup-uploads__success.json') as Map;
      expect(h.adapter.requests.last.jsonBody, {
        'signupToken': fx['signupToken'],
      });
    });

    fakeTest('TC-ONB-024 200이면 토큰 4종과 userId를 저장하고 푸시 등록을 시작한다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      _await(async, h);
      final fx = Fixture.load(_success) as Map;
      final Session saved = h.store.writes.single;
      expect(saved.userId, fx['userId']);
      expect(saved.accessToken, fx['accessToken']);
      expect(saved.refreshToken, fx['refreshToken']);
      expect(saved.accessTokenExpiresAt, t0.add(const Duration(seconds: 900)));
      expect(
        saved.refreshTokenExpiresAt,
        t0.add(const Duration(seconds: 2592000)),
      );
      expect(saved.isGuest, isFalse);
      expect(h.push.calls, 1);
    });

    fakeTest('TC-ONB-024 푸시 등록이 실패해도 가입은 성공이다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      h.push.error = StateError('push');
      expect(_await(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.store.writes, hasLength(1));
    });

    fakeTest('TC-ONB-025 가입 성공 뒤 social-login 재호출이 0건이다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      _await(async, h);
      expect(h.adapter.count('POST', socialLoginPath), 0);
    });

    fakeTest('TC-ONB-038 이미 가입된 같은 계정의 중복 호출이 200이면 성공과 같게 처리한다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      expect(_await(async, h), isA<SignatureSubmitSucceeded>());
      expect(_await(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.store.writes, hasLength(2));
    });

    fakeTest('TC-ONB-046 같은 idToken·rawNonce로 업로드 발급을 요청한다', (async) {
      final h = OnboardingHarness()..scriptSignupSuccess();
      _await(async, h);
      expect(h.adapter.requests.first.jsonBody, {
        'provider': 'KAKAO',
        'idToken': kakaoCredentials.idToken,
        'rawNonce': kakaoCredentials.rawNonce,
      });
    });
  });

  group('SIGNATURE_PROCESSING_PENDING 재시도', () {
    fakeTest(
      'TC-ONB-026 첫 확정이 PENDING이면 같은 signupToken으로 1초 뒤 재요청하고 uploads/PUT은 다시 부르지 않는다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploadsOk()
          ..onSignupPutOk()
          ..onSignup([_pending, _success]);
        final p = _run(async, h);
        expect(h.adapter.count('POST', signupPath), 1);
        expect(p.done, isFalse);
        advance(async, const Duration(milliseconds: 999));
        expect(h.adapter.count('POST', signupPath), 1);
        advance(async, const Duration(milliseconds: 1));
        expect(h.adapter.count('POST', signupPath), 2);
        expect(p.value, isA<SignatureSubmitSucceeded>());
        expect(h.adapter.count('POST', signupUploadsPath), 1);
        expect(h.putRequests, hasLength(1));
        final bodies = h.adapter
            .where('POST', signupPath)
            .map((r) => r.jsonBody)
            .toList();
        expect(bodies[0], bodies[1]);
      },
    );

    fakeTest('TC-ONB-027 PENDING 2회 뒤 200이면 2초 시점에 성공하고 signup 요청은 총 3회다', (
      async,
    ) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk()
        ..onSignup([_pending, _pending, _success]);
      final p = _run(async, h);
      advance(async, const Duration(milliseconds: 1999));
      expect(p.done, isFalse);
      advance(async, const Duration(milliseconds: 1));
      expect(p.value, isA<SignatureSubmitSucceeded>());
      expect(h.adapter.count('POST', signupPath), 3);
      final times = h.adapter
          .where('POST', signupPath)
          .map((r) => r.at.difference(t0).inMilliseconds)
          .toList();
      expect(times, [0, 1000, 2000]);
    });

    fakeTest(
      'TC-ONB-028 PENDING이 계속되면 최초 1회 + 재시도 10회(총 11회, 10초)까지 보내고 소진하면 timeout이다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploadsOk()
          ..onSignupPutOk()
          ..onSignup([_pending]);
        final p = _run(async, h);
        // 9번째 재시도 시점(9초): 총 10회, 아직 끝나지 않았다.
        advance(async, const Duration(seconds: 9));
        expect(h.adapter.count('POST', signupPath), 10);
        expect(p.done, isFalse);
        // 10번째 재시도 시점(10초): 총 11회째에서 소진된다.
        advance(async, const Duration(seconds: 1));
        expect(h.adapter.count('POST', signupPath), 11);
        expect(_kind(p.value!), SignatureFailureKind.timeout);
        // 이후 더 보내지 않는다.
        advance(async, const Duration(seconds: 30));
        expect(h.adapter.count('POST', signupPath), 11);
        final times = h.adapter
            .where('POST', signupPath)
            .map((r) => r.at.difference(t0).inSeconds)
            .toList();
        expect(times, [for (var i = 0; i <= 10; i++) i]);
      },
    );

    fakeTest(
      'TC-ONB-029 타임아웃 뒤 다시 시도하면 새 uploads부터 같은 idToken·rawNonce로 시작한다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploadsOk()
          ..onSignupPutOk()
          ..onSignup([_pending]);
        final p = _run(async, h);
        advance(async, const Duration(seconds: 11));
        expect(_kind(p.value!), SignatureFailureKind.timeout);
        _run(async, h);
        advance(async, const Duration(seconds: 1));
        expect(h.adapter.count('POST', signupUploadsPath), 2);
        expect(h.putRequests, hasLength(2));
        final uploadBodies = h.adapter
            .where('POST', signupUploadsPath)
            .map((r) => r.jsonBody)
            .toList();
        expect(uploadBodies[0], uploadBodies[1]);
      },
    );

    fakeTest('TC-ONB-030 PENDING 재시도 중 signupToken이 만료돼 401이면 expired다', (
      async,
    ) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk()
        ..onSignup([_pending, 'onboarding/signup__unauthorized.json']);
      final p = _run(async, h);
      advance(async, const Duration(seconds: 1));
      expect(_kind(p.value!), SignatureFailureKind.expired);
      expect(h.adapter.count('POST', signupPath), 2);
      expect(h.store.writes, isEmpty);
    });

    fakeTest('TC-ONB-044 PENDING 대기 중 취소하면 더 요청하지 않고 Cancelled다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk()
        ..onSignup([_pending, _success]);
      final token = CancelToken();
      final p = _run(async, h, token: token);
      advance(async, const Duration(milliseconds: 500));
      token.cancel();
      advance(async, const Duration(seconds: 10));
      expect(p.value, isA<SignatureSubmitCancelled>());
      expect(h.adapter.count('POST', signupPath), 1);
      expect(h.store.writes, isEmpty);
      expect(h.push.calls, 0);
    });
  });

  group('업로드 발급(1단계) 오류', () {
    fakeTest(
      'TC-ONB-031 400이면 같은 idToken·rawNonce로 social-login을 다시 불러 LOGIN_SUCCESS면 로그인 성공 처리한다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploads(
            'onboarding/signup-uploads__already-registered.json',
          )
          ..onSocialLogin('auth/social-login__login-success.json');
        expect(_await(async, h), isA<SignatureSubmitSucceeded>());
        expect(h.adapter.requests.map((r) => r.path).toList(), [
          signupUploadsPath,
          socialLoginPath,
        ]);
        expect(h.adapter.requests.last.jsonBody, {
          'provider': 'KAKAO',
          'idToken': kakaoCredentials.idToken,
          'rawNonce': kakaoCredentials.rawNonce,
        });
        expect(h.store.writes, hasLength(1));
        expect(h.push.calls, 1);
        expect(h.putRequests, isEmpty);
      },
    );

    fakeTest('TC-ONB-031 social-login이 다시 SIGN_UP_REQUIRED면 일반 실패다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploads('onboarding/signup-uploads__already-registered.json')
        ..onSocialLogin('auth/social-login__sign-up-required.json');
      expect(_kind(_await(async, h)), SignatureFailureKind.generic);
      expect(h.store.writes, isEmpty);
    });

    fakeTest('TC-ONB-031 social-login 재호출이 403이면 서버 message를 담은 forbidden이다', (
      async,
    ) {
      final h = OnboardingHarness()
        ..onSignupUploads('onboarding/signup-uploads__already-registered.json')
        ..onSocialLogin('auth/social-login__forbidden-banned.json');
      final f = _failure(_await(async, h));
      expect(f.kind, SignatureFailureKind.forbidden);
      expect(f.serverMessage, isNotEmpty);
    });

    fakeTest(
      'TC-ONB-032 uploads 403이면 서버 message를 담은 forbidden이고 이후 요청이 0건이다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploads('onboarding/signup-uploads__forbidden-banned.json');
        final f = _failure(_await(async, h));
        expect(f.kind, SignatureFailureKind.forbidden);
        expect(
          f.serverMessage,
          (Fixture.load('onboarding/signup-uploads__forbidden-banned.json')
              as Map)['message'],
        );
        expect(h.adapter.requests, hasLength(1));
      },
    );

    fakeTest('TC-ONB-033 uploads 401이면 expired이고 이후 요청이 0건이다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploads('onboarding/signup-uploads__unauthorized.json');
      expect(_kind(_await(async, h)), SignatureFailureKind.expired);
      expect(h.adapter.requests, hasLength(1));
    });
  });

  group('presigned PUT(2단계) 오류', () {
    for (final fixture in [
      'onboarding/presigned-put__expired.json',
      'onboarding/presigned-put__content-type-mismatch.json',
    ]) {
      fakeTest('TC-ONB-040 $fixture면 signup 호출 0건이고 일반 실패다', (async) {
        final h = OnboardingHarness()
          ..onSignupUploadsOk()
          ..onSignupPut(fixture);
        expect(_kind(_await(async, h)), SignatureFailureKind.generic);
        expect(h.adapter.count('POST', signupPath), 0);
        expect(h.store.writes, isEmpty);
      });
    }

    fakeTest('TC-ONB-040 실패 뒤 다시 시도하면 새 uploads부터 시작한다', (async) {
      final h = OnboardingHarness()..onSignupUploadsOk();
      h.adapter.on('PUT', signupUploadPutPath, [
        FakeResponse.fixture('onboarding/presigned-put__expired.json'),
        FakeResponse.fixture('onboarding/presigned-put__ok.json'),
      ]);
      h.onSignup([_success]);
      expect(_kind(_await(async, h)), SignatureFailureKind.generic);
      expect(_await(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.adapter.count('POST', signupUploadsPath), 2);
    });
  });

  group('확정(3단계) 오류', () {
    SignatureFailure run(FakeAsync async, String fixture) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk()
        ..onSignup([fixture]);
      final out = _await(async, h);
      expect(h.store.writes, isEmpty);
      expect(h.adapter.count('POST', signupPath), 1, reason: '자동 재시도 금지');
      return _failure(out);
    }

    fakeTest('TC-ONB-035 사용할 수 없는 사인(400)은 invalid다', (async) {
      expect(
        run(async, 'onboarding/signup__invalid-signature.json').kind,
        SignatureFailureKind.invalid,
      );
    });

    fakeTest('TC-ONB-036 업로드 없음(404)은 reupload다', (async) {
      expect(
        run(async, 'onboarding/signup__upload-not-found.json').kind,
        SignatureFailureKind.reupload,
      );
    });

    fakeTest('TC-ONB-037 403은 서버 message를 담은 forbidden이다', (async) {
      final f = run(async, 'onboarding/signup__forbidden-banned.json');
      expect(f.kind, SignatureFailureKind.forbidden);
      expect(
        f.serverMessage,
        (Fixture.load('onboarding/signup__forbidden-banned.json')
            as Map)['message'],
      );
    });

    // 카탈로그는 "일반 실패 문구"를 기대하지만 세 경우가 같은 400 BUSINESS_ERROR라 D-02(message로
    // 분기 금지)상 구분할 수 없다. spec 확인 필요 5번대로 모두 invalid로 닫는다.
    fakeTest(
      'TC-ONB-034 이미 사용된 가입 토큰(400)은 D-02에 따라 invalid로 처리하고 다음 시도는 새 uploads부터다',
      (async) {
        final h = OnboardingHarness()
          ..onSignupUploadsOk()
          ..onSignupPutOk()
          ..onSignup(['onboarding/signup__already-used-token.json', _success]);
        expect(_kind(_await(async, h)), SignatureFailureKind.invalid);
        expect(_await(async, h), isA<SignatureSubmitSucceeded>());
        expect(h.adapter.count('POST', signupUploadsPath), 2);
      },
    );

    fakeTest('TC-ONB-039 탈퇴 회원이라는 400도 D-02에 따라 invalid로 처리한다', (async) {
      expect(
        run(async, 'onboarding/signup__already-registered-withdrawn.json').kind,
        SignatureFailureKind.invalid,
      );
    });

    fakeTest('TC-ONB-030 확정 401은 expired다', (async) {
      expect(
        run(async, 'onboarding/signup__unauthorized.json').kind,
        SignatureFailureKind.expired,
      );
    });
  });

  group('네트워크·서버 오류', () {
    fakeTest('TC-ONB-041 uploads 연결 실패는 network이고 재시도하지 않는다(가입 POST)', (async) {
      final h = OnboardingHarness();
      h.adapter.on('POST', signupUploadsPath, [
        const FakeResponse.fault(FakeFault.disconnect),
      ]);
      final p = _run(async, h);
      advance(async, const Duration(seconds: 5));
      expect(_kind(p.value!), SignatureFailureKind.network);
      expect(h.adapter.count('POST', signupUploadsPath), 1);
    });

    fakeTest('TC-ONB-041 presigned PUT 타임아웃은 D-21대로 최대 2회 재시도한 뒤 network다', (
      async,
    ) {
      final h = OnboardingHarness()..onSignupUploadsOk();
      h.adapter.on('PUT', signupUploadPutPath, [
        const FakeResponse.fault(FakeFault.timeout),
      ]);
      final p = _run(async, h);
      advance(async, const Duration(minutes: 10));
      expect(_kind(p.value!), SignatureFailureKind.network);
      expect(h.putRequests, hasLength(3));
      expect(h.adapter.count('POST', signupPath), 0);
    });

    fakeTest('TC-ONB-041 확정 타임아웃은 network이고 재시도하지 않으며 사인은 유지된다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk();
      h.adapter.on('POST', signupPath, [
        const FakeResponse.fault(FakeFault.timeout),
      ]);
      final p = _run(async, h);
      advance(async, const Duration(minutes: 1));
      expect(_kind(p.value!), SignatureFailureKind.network);
      expect(h.adapter.count('POST', signupPath), 1);
    });

    fakeTest('TC-ONB-042 uploads 500은 일반 실패이고 자동 재시도하지 않는다', (async) {
      final h = OnboardingHarness();
      h.adapter.on('POST', signupUploadsPath, [
        FakeResponse.fixture('common/error__internal-500.json'),
      ]);
      final p = _run(async, h);
      advance(async, const Duration(seconds: 5));
      expect(_kind(p.value!), SignatureFailureKind.generic);
      expect(h.adapter.count('POST', signupUploadsPath), 1);
    });

    fakeTest('TC-ONB-042 확정 500은 일반 실패이고 자동 재시도하지 않는다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk();
      h.adapter.on('POST', signupPath, [
        FakeResponse.fixture('common/error__internal-500.json'),
      ]);
      final p = _run(async, h);
      advance(async, const Duration(seconds: 5));
      expect(_kind(p.value!), SignatureFailureKind.generic);
      expect(h.adapter.count('POST', signupPath), 1);
    });

    fakeTest('TC-ONB-042 해석할 수 없는 확정 응답(토큰 없음)은 일반 실패다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk();
      h.adapter.on('POST', signupPath, [
        FakeResponse.json(200, {'userId': 'u'}),
      ]);
      expect(_kind(_await(async, h)), SignatureFailureKind.generic);
      expect(h.store.writes, isEmpty);
    });
  });

  group('취소', () {
    fakeTest(
      'TC-ONB-044 업로드 PUT 중 취소하면 Cancelled이고 signup 호출·세션 저장·푸시 등록이 없다',
      (async) {
        final h = OnboardingHarness()..onSignupUploadsOk();
        h.adapter.on('PUT', signupUploadPutPath, [
          FakeResponse.fixture(
            'onboarding/presigned-put__ok.json',
            delay: const Duration(seconds: 5),
          ),
        ]);
        h.onSignup([_success]);
        final token = CancelToken();
        final p = _run(async, h, token: token);
        token.cancel();
        advance(async, const Duration(seconds: 10));
        expect(p.value, isA<SignatureSubmitCancelled>());
        expect(h.adapter.count('POST', signupPath), 0);
        expect(h.store.writes, isEmpty);
        expect(h.push.calls, 0);
      },
    );

    fakeTest('TC-ONB-044 확정 응답을 기다리던 중 취소하면 세션을 저장하지 않는다', (async) {
      final h = OnboardingHarness()
        ..onSignupUploadsOk()
        ..onSignupPutOk();
      h.adapter.on('POST', signupPath, [
        FakeResponse.fixture(_success, delay: const Duration(seconds: 2)),
      ]);
      final token = CancelToken();
      final p = _run(async, h, token: token);
      advance(async, const Duration(seconds: 1));
      token.cancel();
      advance(async, const Duration(seconds: 5));
      expect(p.value, isA<SignatureSubmitCancelled>());
      expect(h.store.writes, isEmpty);
      expect(h.push.calls, 0);
    });
  });
}
