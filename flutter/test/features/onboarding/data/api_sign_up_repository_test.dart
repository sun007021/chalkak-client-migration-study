import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/onboarding/data/api_sign_up_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show t0;
import '../../../support/onboarding_fakes.dart';

Future<ApiError> _error(Future<Object?> Function() call) async {
  try {
    await call();
  } on ApiError catch (e) {
    return e;
  }
  fail('ApiError가 와야 한다');
}

ApiSignUpRepository _repo(OnboardingHarness h) =>
    ApiSignUpRepository(client: h.client);

void main() {
  group('업로드 발급 (POST /auth/social-signup/signature/uploads)', () {
    test(
      'TC-ONB-020 바디는 {provider, idToken, rawNonce}뿐이고 authorizationCode가 없으며 Authorization이 없다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()..onSignupUploadsOk();
        await _repo(h).requestUpload(kakaoCredentials);
        final r = h.adapter.requests.single;
        expect(r.method, 'POST');
        expect(r.path, signupUploadsPath);
        expect(r.jsonBody, {
          'provider': 'KAKAO',
          'idToken': 'kakao-id-token-1',
          'rawNonce': 'raw-nonce-1',
        });
        expect(r.jsonBody!.containsKey('authorizationCode'), isFalse);
        expect(r.hasAuthorization, isFalse);
      }),
    );

    test(
      'TC-ONB-021 uploadId, uploadUrl, expiresInSeconds(300), signupToken을 읽는다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()..onSignupUploadsOk();
        final t = await _repo(h).requestUpload(kakaoCredentials);
        final fx =
            Fixture.load('onboarding/signup-uploads__success.json') as Map;
        expect(t.upload.uploadId, fx['uploadId']);
        expect(t.upload.uploadUrl, Uri.parse(fx['uploadUrl']! as String));
        expect(t.upload.expiresInSeconds, 300);
        expect(t.signupToken, fx['signupToken']);
      }),
    );

    test(
      'TC-ONB-021 필수 필드가 없는 200은 invalidResponse다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness();
        h.adapter.on('POST', signupUploadsPath, [
          FakeResponse.json(200, {'uploadId': 'x'}),
        ]);
        final e = await _error(() => _repo(h).requestUpload(kakaoCredentials));
        expect(e.isInvalidResponse, isTrue);
      }),
    );

    test(
      'TC-ONB-031 400은 status 400 businessError로 전달된다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()
          ..onSignupUploads(
            'onboarding/signup-uploads__already-registered.json',
          );
        final e = await _error(() => _repo(h).requestUpload(kakaoCredentials));
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.businessError);
      }),
    );

    test(
      'TC-ONB-032 403은 forbidden이고 서버 message를 담는다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()
          ..onSignupUploads('onboarding/signup-uploads__forbidden-banned.json');
        final e = await _error(() => _repo(h).requestUpload(kakaoCredentials));
        expect(e.errorCode, ApiErrorCode.forbidden);
        expect(e.message, isNotEmpty);
        expect(h.adapter.requests, hasLength(1));
      }),
    );

    test(
      'TC-ONB-042 500이어도 자동 재시도하지 않는다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness();
        h.adapter.on('POST', signupUploadsPath, [
          FakeResponse.fixture('common/error__internal-500.json'),
        ]);
        final e = await _error(() => _repo(h).requestUpload(kakaoCredentials));
        expect(e.status, 500);
        expect(h.adapter.count('POST', signupUploadsPath), 1);
      }),
    );
  });

  group('가입 확정 (POST /auth/social-signup)', () {
    test(
      'TC-ONB-023 바디는 {signupToken}뿐이고 Authorization이 없다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()
          ..onSignup(['onboarding/signup__success.json']);
        await _repo(h).signUp('signup-token-1');
        final r = h.adapter.requests.single;
        expect(r.method, 'POST');
        expect(r.path, signupPath);
        expect(r.jsonBody, {'signupToken': 'signup-token-1'});
        expect(r.hasAuthorization, isFalse);
      }),
    );

    test(
      'TC-ONB-024 200이면 토큰 4종과 userId를 담은 세션을 만들고 만료는 now + 응답 초다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()
          ..onSignup(['onboarding/signup__success.json']);
        final s = await _repo(h).signUp('t');
        final fx = Fixture.load('onboarding/signup__success.json') as Map;
        expect(s.userId, fx['userId']);
        expect(s.accessToken, fx['accessToken']);
        expect(s.refreshToken, fx['refreshToken']);
        expect(s.accessTokenExpiresAt, t0.add(const Duration(seconds: 900)));
        expect(
          s.refreshTokenExpiresAt,
          t0.add(const Duration(seconds: 2592000)),
        );
        expect(s.isGuest, isFalse);
        // 저장은 호출자 몫이다.
        expect(h.store.writes, isEmpty);
      }),
    );

    test(
      'TC-ONB-024 토큰 필드가 없는 200은 invalidResponse다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness();
        h.adapter.on('POST', signupPath, [
          FakeResponse.json(200, {'userId': 'u'}),
        ]);
        final e = await _error(() => _repo(h).signUp('t'));
        expect(e.isInvalidResponse, isTrue);
      }),
    );

    test(
      'TC-ONB-026 400 SIGNATURE_PROCESSING_PENDING은 해당 errorCode로 전달된다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()
          ..onSignup(['onboarding/signup__signature-processing-pending.json']);
        final e = await _error(() => _repo(h).signUp('t'));
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.signatureProcessingPending);
        expect(h.adapter.requests, hasLength(1));
      }),
    );

    for (final (fixture, status, code, tc) in [
      (
        'onboarding/signup__unauthorized.json',
        401,
        ApiErrorCode.unauthorized,
        'TC-ONB-030',
      ),
      (
        'onboarding/signup__forbidden-banned.json',
        403,
        ApiErrorCode.forbidden,
        'TC-ONB-037',
      ),
      (
        'onboarding/signup__invalid-signature.json',
        400,
        ApiErrorCode.businessError,
        'TC-ONB-035',
      ),
      (
        'onboarding/signup__upload-not-found.json',
        404,
        ApiErrorCode.businessError,
        'TC-ONB-036',
      ),
    ]) {
      test(
        '$tc $fixture는 status $status, $code로 전달되고 재시도하지 않는다',
        () => atFixtureNow(() async {
          final h = OnboardingHarness()..onSignup([fixture]);
          final e = await _error(() => _repo(h).signUp('t'));
          expect(e.status, status);
          expect(e.errorCode, code);
          expect(h.adapter.count('POST', signupPath), 1);
        }),
      );
    }

    test(
      'TC-ONB-042 500이어도 자동 재시도하지 않는다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness();
        h.adapter.on('POST', signupPath, [
          FakeResponse.fixture('common/error__internal-500.json'),
        ]);
        final e = await _error(() => _repo(h).signUp('t'));
        expect(e.status, 500);
        expect(h.adapter.count('POST', signupPath), 1);
      }),
    );
  });

  group('presigned 업로더 (가입)', () {
    test(
      'TC-ONB-022 PUT은 Content-Type image/png, Authorization 없음, 본문은 PNG 바이트 전체다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness()..onSignupPutOk();
        final png = fakePng(4096);
        await h.uploader.upload(
          Uri.parse(
            'http://localhost:4010$signupUploadPutPath?X-Amz-Expires=300',
          ),
          png,
        );
        final r = h.adapter.requests.single;
        expect(r.method, 'PUT');
        expect(r.header('content-type'), 'image/png');
        expect(r.hasAuthorization, isFalse);
        expect(h.bodyBytes(r), png);
      }),
    );

    test(
      'TC-ONB-022 업로드 URL이 https도 loopback도 아니면 요청 없이 invalidResponse다',
      () => atFixtureNow(() async {
        final h = OnboardingHarness();
        final e = await _error(
          () => h.uploader.upload(Uri.parse('http://example.com/x'), tinyPng),
        );
        expect(e.isInvalidResponse, isTrue);
        expect(h.adapter.requests, isEmpty);
      }),
    );
  });
}
