import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/signature/domain/signature_failure.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, sessionAt;
import '../../../support/onboarding_fakes.dart';

OnboardingHarness _member() => OnboardingHarness(session: sessionAt());

SignatureSubmitOutcome _submit(
  FakeAsync async,
  OnboardingHarness h, {
  CancelToken? token,
}) => resolve(async, h.changeSignature.submit(tinyPng, token ?? CancelToken()));

SignatureFailureKind _kind(SignatureSubmitOutcome o) {
  expect(o, isA<SignatureSubmitFailed>(), reason: '$o');
  return (o as SignatureSubmitFailed).failure.kind;
}

void main() {
  fakeTest('TC-SIGN-019 순서는 uploads 발급 -> presigned PUT -> 확정 PUT이다', (async) {
    final h = _member()..scriptChangeSuccess();
    final out = _submit(async, h);
    expect(out, isA<SignatureSubmitSucceeded>());
    expect(h.sequence, [
      'POST $meSignatureUploadsPath',
      'PUT $changeUploadPutPath',
      'PUT $meSignaturePath',
    ]);
    expect(h.adapter.requests.last.jsonBody, {
      'signatureOriginalUploadId': '55555555-5555-4555-8555-555555555521',
    });
    expect(h.bodyBytes(h.putRequests.single), tinyPng);
  });

  fakeTest('TC-SIGN-022 확정 호출 뒤 GET은 부르지 않는다(재조회는 설정 카드 몫)', (async) {
    final h = _member()..scriptChangeSuccess();
    _submit(async, h);
    expect(h.adapter.count('GET', meSignaturePath), 0);
  });

  group('앞 단계 실패 시 다음 단계를 부르지 않는다', () {
    fakeTest('TC-SIGN-023 업로드 PUT이 403이면 확정 호출 0건, 일반 실패다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePut('signature/presigned-put__forbidden.json');
      final out = _submit(async, h);
      expect(_kind(out), SignatureFailureKind.generic);
      expect(h.adapter.count('PUT', meSignaturePath), 0);
    });

    fakeTest('TC-SIGN-030 uploads 403이면 정지 회원 실패이고 이후 요청이 0건이다', (async) {
      final h = _member()
        ..onChangeUploads(
          'signature/users-me-signature-uploads__forbidden-banned.json',
        );
      final out = _submit(async, h);
      expect(_kind(out), SignatureFailureKind.forbidden);
      expect(h.adapter.requests, hasLength(1));
    });

    fakeTest('TC-SIGN-031 확정 403이면 정지 회원 실패이고 재요청이 없다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk()
        ..onConfirm([
          'signature/users-me-signature__put-forbidden-banned.json',
        ]);
      final out = _submit(async, h);
      expect(_kind(out), SignatureFailureKind.forbidden);
      expect(h.adapter.count('PUT', meSignaturePath), 1);
    });

    fakeTest('TC-SIGN-035 uploads가 500이면 백오프 재시도 후 일반 실패이고 PUT은 부르지 않는다', (
      async,
    ) {
      final h = _member();
      h.adapter.on('POST', meSignatureUploadsPath, [
        FakeResponse.fixture(
          'signature/users-me-signature__put-internal-error.json',
        ),
      ]);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      advance(async, const Duration(seconds: 2));
      expect(_kind(p.value!), SignatureFailureKind.generic);
      expect(h.adapter.count('POST', meSignatureUploadsPath), 3);
      expect(h.putRequests, isEmpty);
    });

    fakeTest('TC-SIGN-035 확정이 500이면 백오프 재시도 후 일반 실패다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk()
        ..onConfirm(['signature/users-me-signature__put-internal-error.json']);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      advance(async, const Duration(seconds: 2));
      expect(_kind(p.value!), SignatureFailureKind.generic);
      expect(h.adapter.count('PUT', meSignaturePath), 3);
    });
  });

  group('확정 오류 분류', () {
    SignatureFailureKind run(FakeAsync async, String fixture) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk()
        ..onConfirm([fixture]);
      return _kind(_submit(async, h));
    }

    fakeTest('TC-SIGN-028 SIGNATURE_REUPLOAD_REQUIRED는 reupload다', (async) {
      expect(
        run(async, 'signature/users-me-signature__put-reupload-required.json'),
        SignatureFailureKind.reupload,
      );
    });

    fakeTest('TC-SIGN-029 400 BUSINESS_ERROR는 invalid다', (async) {
      expect(
        run(async, 'signature/users-me-signature__put-invalid-signature.json'),
        SignatureFailureKind.invalid,
      );
    });

    fakeTest('TC-SIGN-032 404는 notFound다', (async) {
      expect(
        run(async, 'signature/users-me-signature__put-upload-not-found.json'),
        SignatureFailureKind.notFound,
      );
    });
  });

  group('재시도', () {
    fakeTest('TC-SIGN-024 실패 뒤 다시 시도하면 이전 uploadId를 쓰지 않고 새 uploads부터 시작한다', (
      async,
    ) {
      final h = _member()..onChangeUploadsOk();
      h.adapter.on('PUT', changeUploadPutPath, [
        FakeResponse.fixture('signature/presigned-put__forbidden.json'),
        FakeResponse.fixture('signature/presigned-put__ok.json'),
      ]);
      h.onConfirm(['signature/users-me-signature__put-success.json']);
      expect(_kind(_submit(async, h)), SignatureFailureKind.generic);
      expect(h.adapter.count('POST', meSignatureUploadsPath), 1);
      expect(h.adapter.count('PUT', meSignaturePath), 0);
      expect(_submit(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.adapter.count('POST', meSignatureUploadsPath), 2);
      expect(h.adapter.count('PUT', meSignaturePath), 1);
    });

    fakeTest('TC-SIGN-028 REUPLOAD_REQUIRED 뒤 다음 시도는 새 uploads부터다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk()
        ..onConfirm([
          'signature/users-me-signature__put-reupload-required.json',
          'signature/users-me-signature__put-success.json',
        ]);
      expect(_kind(_submit(async, h)), SignatureFailureKind.reupload);
      expect(_submit(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.adapter.count('POST', meSignatureUploadsPath), 2);
      expect(h.putRequests, hasLength(2));
    });
  });

  group('인증', () {
    fakeTest('TC-SIGN-033 401이면 refresh 후 원 요청을 1회 재전송하고 성공한다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk();
      h.adapter.on('PUT', meSignaturePath, [
        FakeResponse.fixture(
          'signature/users-me-signature__put-unauthorized.json',
        ),
        FakeResponse.fixture('signature/users-me-signature__put-success.json'),
      ]);
      h.onRefresh('auth/refresh__success.json');
      expect(_submit(async, h), isA<SignatureSubmitSucceeded>());
      expect(h.adapter.count('POST', refreshPath), 1);
      expect(h.adapter.count('PUT', meSignaturePath), 2);
    });

    fakeTest('TC-SIGN-033 REAUTH면 expired 실패이고 세션이 지워진다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk();
      h.adapter.on('PUT', meSignaturePath, [
        FakeResponse.fixture(
          'signature/users-me-signature__put-unauthorized.json',
        ),
      ]);
      h.onRefresh('auth/refresh__reauthentication-required.json');
      expect(_kind(_submit(async, h)), SignatureFailureKind.expired);
      expect(h.store.current, isNull);
      expect(h.clearedReasons, [SessionClearReason.reauthenticationRequired]);
    });
  });

  group('네트워크·취소·계정 전환', () {
    fakeTest('TC-SIGN-034 uploads 연결 실패는 network다', (async) {
      final h = _member();
      h.adapter.on('POST', meSignatureUploadsPath, [
        const FakeResponse.fault(FakeFault.disconnect),
      ]);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      advance(async, const Duration(seconds: 2));
      expect(_kind(p.value!), SignatureFailureKind.network);
    });

    fakeTest('TC-SIGN-034 업로드 PUT 타임아웃도 network다', (async) {
      final h = _member()..onChangeUploadsOk();
      h.adapter.on('PUT', changeUploadPutPath, [
        const FakeResponse.fault(FakeFault.timeout),
      ]);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      advance(async, const Duration(minutes: 5));
      expect(_kind(p.value!), SignatureFailureKind.network);
      expect(h.adapter.count('PUT', meSignaturePath), 0);
    });

    fakeTest('TC-SIGN-037 업로드 중 취소하면 Cancelled이고 확정 호출이 0건이다', (async) {
      final h = _member()..onChangeUploadsOk();
      h.adapter.on('PUT', changeUploadPutPath, [
        FakeResponse.fixture(
          'signature/presigned-put__ok.json',
          delay: const Duration(seconds: 5),
        ),
      ]);
      final token = CancelToken();
      final p = start(async, h.changeSignature.submit(tinyPng, token));
      token.cancel();
      advance(async, const Duration(seconds: 10));
      expect(p.value, isA<SignatureSubmitCancelled>());
      expect(h.adapter.count('PUT', meSignaturePath), 0);
    });

    fakeTest('TC-SIGN-038 확정 응답을 기다리는 사이 다른 계정으로 바뀌면 결과를 버린다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk();
      h.adapter.on('PUT', meSignaturePath, [
        FakeResponse.fixture(
          'signature/users-me-signature__put-success.json',
          delay: const Duration(seconds: 1),
        ),
      ]);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      h.store.current = sessionAt(userId: 'user-2', at: 'at9', rt: 'rt9');
      advance(async, const Duration(seconds: 2));
      expect(p.value, isA<SignatureSubmitCancelled>());
    });

    fakeTest('TC-SIGN-038 확정 응답을 기다리는 사이 로그아웃되면 결과를 버린다', (async) {
      final h = _member()
        ..onChangeUploadsOk()
        ..onChangePutOk();
      h.adapter.on('PUT', meSignaturePath, [
        FakeResponse.fixture(
          'signature/users-me-signature__put-success.json',
          delay: const Duration(seconds: 1),
        ),
      ]);
      final p = start(async, h.changeSignature.submit(tinyPng, CancelToken()));
      h.store.current = null;
      advance(async, const Duration(seconds: 2));
      expect(p.value, isA<SignatureSubmitCancelled>());
    });
  });
}
