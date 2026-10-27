import 'package:chalkak/core/network/api_error.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show advance, sessionAt, t0;
import '../../../support/onboarding_fakes.dart';

Future<ApiError> _error(Future<Object?> Function() call) async {
  try {
    await call();
  } on ApiError catch (e) {
    return e;
  }
  fail('ApiError가 와야 한다');
}

OnboardingHarness _member() => OnboardingHarness(session: sessionAt());

void main() {
  group('업로드 발급 (POST /users/me/signature/uploads)', () {
    test(
      'TC-SIGN-020 응답에서 uploadId·uploadUrl·expiresInSeconds만 읽고 contentType/maxBytes가 없어도 오류가 아니다',
      () => atFixtureNow(() async {
        final h = _member()..onChangeUploadsOk();
        final t = await h.signatureRepository.requestUpload();
        expect(t.uploadId, '55555555-5555-4555-8555-555555555521');
        expect(t.uploadUrl.path, changeUploadPutPath);
        expect(t.expiresInSeconds, 300);
      }),
    );

    test(
      'TC-SIGN-019 발급 요청은 POST, 본문 없음, Authorization 있음이다',
      () => atFixtureNow(() async {
        final h = _member()..onChangeUploadsOk();
        await h.signatureRepository.requestUpload();
        final r = h.adapter.requests.single;
        expect(r.method, 'POST');
        expect(r.path, meSignatureUploadsPath);
        expect(r.body ?? '', isEmpty);
        expect(r.hasAuthorization, isTrue);
      }),
    );

    test(
      'TC-SIGN-030 403 FORBIDDEN은 ApiError(forbidden)이고 같은 요청을 다시 보내지 않는다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onChangeUploads(
            'signature/users-me-signature-uploads__forbidden-banned.json',
          );
        final e = await _error(() => h.signatureRepository.requestUpload());
        expect(e.status, 403);
        expect(e.errorCode, ApiErrorCode.forbidden);
        expect(h.adapter.count('POST', meSignatureUploadsPath), 1);
      }),
    );

    test('TC-SIGN-035 500이면 0.5초, 1초 백오프로 최대 2회 재시도하고 실패한다', () {
      fakeAsync((async) {
        final h = _member();
        h.adapter.on('POST', meSignatureUploadsPath, [
          FakeResponse.fixture(
            'signature/users-me-signature__put-internal-error.json',
          ),
        ]);
        final p = start(async, h.signatureRepository.requestUpload());
        advance(async, const Duration(seconds: 2));
        expect(p.error, isA<ApiError>());
        final times = h.adapter
            .where('POST', meSignatureUploadsPath)
            .map((r) => r.at.difference(t0).inMilliseconds)
            .toList();
        expect(times, [0, 500, 1500]);
      }, initialTime: t0);
    });
  });

  group('확정 (PUT /users/me/signature)', () {
    test(
      'TC-SIGN-022 본문은 {signatureOriginalUploadId}뿐이다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onConfirm(['signature/users-me-signature__put-success.json']);
        await h.signatureRepository.confirm('upload-1');
        final r = h.adapter.requests.single;
        expect(r.method, 'PUT');
        expect(r.path, meSignaturePath);
        expect(r.jsonBody, {'signatureOriginalUploadId': 'upload-1'});
        expect(r.hasAuthorization, isTrue);
      }),
    );

    test(
      'TC-SIGN-028 400 SIGNATURE_REUPLOAD_REQUIRED는 해당 errorCode로 전달된다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onConfirm([
            'signature/users-me-signature__put-reupload-required.json',
          ]);
        final e = await _error(() => h.signatureRepository.confirm('u'));
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.signatureReuploadRequired);
      }),
    );

    test(
      'TC-SIGN-031 403은 forbidden이고 재요청하지 않는다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onConfirm([
            'signature/users-me-signature__put-forbidden-banned.json',
          ]);
        final e = await _error(() => h.signatureRepository.confirm('u'));
        expect(e.errorCode, ApiErrorCode.forbidden);
        expect(h.adapter.count('PUT', meSignaturePath), 1);
      }),
    );

    test(
      'TC-SIGN-032 404는 status 404인 ApiError다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onConfirm([
            'signature/users-me-signature__put-upload-not-found.json',
          ]);
        final e = await _error(() => h.signatureRepository.confirm('u'));
        expect(e.status, 404);
        expect(e.errorCode, ApiErrorCode.businessError);
      }),
    );

    test(
      'TC-SIGN-029 400 BUSINESS_ERROR(사용할 수 없는 사인)는 businessError다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onConfirm([
            'signature/users-me-signature__put-invalid-signature.json',
          ]);
        final e = await _error(() => h.signatureRepository.confirm('u'));
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.businessError);
      }),
    );

    test('TC-SIGN-035 확정 PUT 500도 0.5초, 1초 백오프로 최대 2회 재시도한다', () {
      fakeAsync((async) {
        final h = _member();
        h.onConfirm(['signature/users-me-signature__put-internal-error.json']);
        final p = start(async, h.signatureRepository.confirm('u'));
        advance(async, const Duration(seconds: 2));
        expect(p.error, isA<ApiError>());
        expect(h.adapter.count('PUT', meSignaturePath), 3);
      }, initialTime: t0);
    });

    test(
      'TC-SIGN-033 401이면 refresh 후 원 요청을 1회 재전송한다',
      () => atFixtureNow(() async {
        final h = _member();
        h.adapter.on('PUT', meSignaturePath, [
          FakeResponse.fixture(
            'signature/users-me-signature__put-unauthorized.json',
          ),
          FakeResponse.fixture(
            'signature/users-me-signature__put-success.json',
          ),
        ]);
        h.onRefresh('auth/refresh__success.json');
        await h.signatureRepository.confirm('u');
        expect(h.adapter.count('POST', refreshPath), 1);
        expect(h.adapter.count('PUT', meSignaturePath), 2);
      }),
    );
  });

  group('조회 (GET /users/me/signature)', () {
    test(
      'TC-SIGN-026 썸네일이 있으면 displayUrl은 썸네일이다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onGetSignature(['signature/users-me-signature__get-success.json']);
        final s = await h.signatureRepository.fetchCurrent();
        final fx = Fixture.load(
          'signature/users-me-signature__get-success.json',
        ) as Map;
        expect(s.originalUrl, fx['signatureOriginalImageUrl']);
        expect(s.thumbnailUrl, fx['signatureThumbnailImageUrl']);
        expect(s.displayUrl, fx['signatureThumbnailImageUrl']);
      }),
    );

    test(
      'TC-SIGN-026 썸네일이 null이면 displayUrl은 원본이다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onGetSignature([
            'signature/users-me-signature__get-thumbnail-null.json',
          ]);
        final s = await h.signatureRepository.fetchCurrent();
        final fx = Fixture.load(
          'signature/users-me-signature__get-thumbnail-null.json',
        ) as Map;
        expect(s.thumbnailUrl, isNull);
        expect(s.displayUrl, fx['signatureOriginalImageUrl']);
      }),
    );

    test(
      'TC-SIGN-040 400 SIGNATURE_REGISTRATION_REQUIRED는 해당 errorCode로 전달된다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onGetSignature([
            'signature/users-me-signature__get-registration-required.json',
          ]);
        final e = await _error(() => h.signatureRepository.fetchCurrent());
        expect(e.status, 400);
        expect(e.errorCode, ApiErrorCode.signatureRegistrationRequired);
      }),
    );

    test(
      'TC-SIGN-039 요청은 GET이고 Authorization이 있다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onGetSignature(['signature/users-me-signature__get-success.json']);
        await h.signatureRepository.fetchCurrent();
        final r = h.adapter.requests.single;
        expect(r.method, 'GET');
        expect(r.path, meSignaturePath);
        expect(r.hasAuthorization, isTrue);
      }),
    );

    test(
      'TC-SIGN-015 응답에 URL 필드가 없으면 invalidResponse다',
      () => atFixtureNow(() async {
        final h = _member();
        h.adapter.on('GET', meSignaturePath, [
          FakeResponse.json(200, {'unexpected': true}),
        ]);
        final e = await _error(() => h.signatureRepository.fetchCurrent());
        expect(e.isInvalidResponse, isTrue);
      }),
    );
  });

  group('presigned 업로더', () {
    test(
      'TC-SIGN-021 PUT은 Content-Type image/png, Authorization 없음, 본문은 PNG 전체다',
      () => atFixtureNow(() async {
        final h = _member()..onChangePutOk();
        final png = fakePng(2048);
        final url = Uri.parse(
          'http://localhost:4010$changeUploadPutPath?X-Amz-Expires=300',
        );
        await h.uploader.upload(url, png);
        final r = h.adapter.requests.single;
        expect(r.method, 'PUT');
        expect(r.path, changeUploadPutPath);
        expect(r.header('content-type'), 'image/png');
        expect(r.hasAuthorization, isFalse);
        expect(h.bodyBytes(r), png);
      }),
    );

    test(
      'TC-SIGN-023 S3 403은 ApiError로 전달된다',
      () => atFixtureNow(() async {
        final h = _member()
          ..onChangePut('signature/presigned-put__forbidden.json');
        final url = Uri.parse('http://localhost:4010$changeUploadPutPath');
        final e = await _error(() => h.uploader.upload(url, tinyPng));
        expect(e.status, 403);
      }),
    );
  });
}
