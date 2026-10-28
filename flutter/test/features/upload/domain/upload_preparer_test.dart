import 'dart:typed_data';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/upload/domain/upload_models.dart';
import 'package:clock/clock.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, t0;
import '../../../support/upload_fakes.dart';

const _id1 = '55555555-5555-4555-8555-555555555501';
const _id2 = '55555555-5555-4555-8555-555555555502';
const _wait = Duration(seconds: 10);

UploadFailure _failure(Object? error) {
  expect(error, isA<UploadFailure>());
  return error! as UploadFailure;
}

void main() {
  group('prepare: 정책 발급 -> 인코딩', () {
    fakeTest('TC-UPL-023 정책을 받고 인코딩해 임시 파일을 만들지만 S3로는 보내지 않는다', (async) {
      final r = UploadRig();
      r.monotonic.advance(const Duration(seconds: 7));
      final p = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      expect(r.api.policyCalls, 1);
      expect(r.api.putCalls, 0);
      expect(r.api.createCalls, 0);
      expect(p.policy.uploadId, _id1);
      expect(p.issuedAt, const Duration(seconds: 7));
      expect(p.sizeBytes, 100000);
      expect(r.files.live, 1);
      expect(r.compressor.calls, isNotEmpty);
    });

    fakeTest('TC-UPL-023 인코딩의 maxBytes는 정책 응답값이다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__issued-small-max.json']);
      r.compressor.sizeFor = (q, img) => 2000000;
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorPrepare);
      expect(r.files.live, 0);
    });

    fakeTest('TC-UPL-025 정책 contentType이 image/png면 인코딩 전에 준비 실패이다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__content-type-png.json']);
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorPrepare);
      expect(r.decoder.log, isEmpty);
      expect(r.compressor.calls, isEmpty);
      expect(r.files.files, isEmpty);
    });

    fakeTest('TC-UPL-026 정책 필드 누락은 준비 실패로 처리되고 앱이 깨지지 않는다', (async) {
      final r = UploadRig()..api.policy(['posts-uploads__missing-fields.json']);
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorPrepare);
    });

    fakeTest('TC-UPL-027 403은 정지 문구이고 재요청하지 않는다', (async) {
      final r = UploadRig()..api.policy(['posts-uploads__403-banned.json']);
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadGateBanned);
      expect(r.api.policyCalls, 1);
    });

    fakeTest('TC-UPL-027 500은 0.5초·1초 재시도 뒤 준비 실패 문구이다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__500-server-error.json']);
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorPrepare);
      expect(
        r.http.adapter
            .where('POST', '/api/v1/posts/uploads')
            .map((q) => q.at.difference(t0).inMilliseconds),
        [0, 500, 1500],
      );
    });

    fakeTest('TC-UPL-027 연결 실패는 네트워크 문구이다', (async) {
      final r = UploadRig()
        ..api.policyResponses(
          List.filled(3, const FakeResponse.fault(FakeFault.disconnect)),
        );
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorNetwork);
    });

    fakeTest('TC-UPL-027 재인증이 필요한 401은 loginRequired이다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__401-unauthorized.json']);
      r.api.refreshReauth();
      final p = start(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      advance(async, _wait);
      expect(_failure(p.error).kind, UploadFailureKind.loginRequired);
    });

    fakeTest(
      'TC-UPL-042 TC-UPL-044 인코딩 실패(용량 초과·읽을 수 없음)는 준비 실패 문구이고 파일이 남지 않는다',
      (async) {
        final big = UploadRig();
        big.compressor.sizeFor = (q, img) => 6000000;
        final p1 = start(
          async,
          big.preparer.prepare(photoBytes(), PhotoEdit.identity),
        );
        advance(async, _wait);
        expect(_failure(p1.error).message, Copy.uploadErrorPrepare);
        expect(big.files.live, 0);

        final empty = UploadRig();
        final p2 = start(
          async,
          empty.preparer.prepare(Uint8List(0), PhotoEdit.identity),
        );
        advance(async, _wait);
        expect(_failure(p2.error).message, Copy.uploadErrorPrepare);
      },
    );

    fakeTest('TC-UPL-031 정책 발급 중 취소하면 cancelled이고 임시 파일을 만들지 않는다', (async) {
      final r = UploadRig()
        ..api.policy([
          'posts-uploads__issued.json',
        ], delay: const Duration(seconds: 3));
      final token = CancelToken();
      final p = start(
        async,
        r.preparer.prepare(
          photoBytes(),
          PhotoEdit.identity,
          cancelToken: token,
        ),
      );
      advance(async, const Duration(seconds: 1));
      token.cancel();
      advance(async, _wait);
      expect(_failure(p.error).kind, UploadFailureKind.cancelled);
      expect(r.files.live, 0);
      expect(r.compressor.calls, isEmpty);
    });

    fakeTest('TC-UPL-031 discard는 소유한 임시 파일을 지우고 여러 번 불러도 된다', (async) {
      final r = UploadRig();
      final p = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      resolve(async, r.preparer.discard(p));
      resolve(async, r.preparer.discard(p));
      expect(r.files.live, 0);
    });
  });

  group('refresh: 제출 직전 만료 확인 (REQ-UPL-041~042)', () {
    fakeTest('TC-UPL-049 발급 후 294.999초면 기존 정책을 그대로 쓴다', (async) {
      final r = UploadRig();
      final first = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      r.monotonic.advance(const Duration(milliseconds: 294999));
      final again = resolve(async, r.preparer.refresh(first, photoBytes()));
      expect(again.policy.uploadId, _id1);
      expect(r.api.policyCalls, 1);
      expect(identical(again.file, first.file), isTrue);
    });

    fakeTest('TC-UPL-050 295.000초·299초·301초면 새 정책(다른 uploadId)을 받는다', (async) {
      for (final age in [
        const Duration(seconds: 295),
        const Duration(seconds: 299),
        const Duration(seconds: 301),
      ]) {
        final r = UploadRig();
        final first = resolve(
          async,
          r.preparer.prepare(photoBytes(), PhotoEdit.identity),
        );
        r.api.policy(['posts-uploads__issued-new.json']);
        r.monotonic.advance(age);
        final again = resolve(async, r.preparer.refresh(first, photoBytes()));
        expect(again.policy.uploadId, _id2, reason: '$age');
        expect(r.api.policyCalls, 2, reason: '$age');
        expect(again.issuedAt, age, reason: '$age');
      }
    });

    fakeTest('TC-UPL-051 벽시계를 +10분 바꿔도 실제 경과 100초면 기존 정책이다', (async) {
      final r = UploadRig();
      final first = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      r.monotonic.advance(const Duration(seconds: 100));
      withClock(Clock.fixed(t0.add(const Duration(minutes: 10))), () {
        final again = resolve(async, r.preparer.refresh(first, photoBytes()));
        expect(again.policy.uploadId, _id1);
      });
      expect(r.api.policyCalls, 1);
    });

    fakeTest('TC-UPL-051 벽시계를 -10분 바꿔도 실제 경과 296초면 새 정책이다', (async) {
      final r = UploadRig();
      final first = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      r.api.policy(['posts-uploads__issued-new.json']);
      r.monotonic.advance(const Duration(seconds: 296));
      withClock(Clock.fixed(t0.subtract(const Duration(minutes: 10))), () {
        final again = resolve(async, r.preparer.refresh(first, photoBytes()));
        expect(again.policy.uploadId, _id2);
      });
    });

    fakeTest('TC-UPL-052 새 maxBytes가 파일 크기 이상이면 파일을 재사용하고 새 uploadId로 쓴다', (
      async,
    ) {
      final r = UploadRig();
      final first = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      final compressCalls = r.compressor.calls.length;
      r.api.policy(['posts-uploads__issued-new.json']);
      r.monotonic.advance(const Duration(seconds: 301));
      final again = resolve(async, r.preparer.refresh(first, photoBytes()));
      expect(again.policy.uploadId, _id2);
      expect(identical(again.file, first.file), isTrue);
      expect(r.compressor.calls, hasLength(compressCalls));
      expect(r.files.live, 1);
    });

    fakeTest('TC-UPL-052 새 maxBytes가 더 작으면 저장한 편집값으로 원본에서 다시 인코딩한다', (async) {
      final r = UploadRig();
      // 90: 2MB(큰 maxBytes에서는 통과), 80: 900KB.
      r.compressor.sizeFor = (q, img) => q == 90 ? 2000000 : 900000;
      const edit = PhotoEdit(
        quarterTurns: 1,
        adjustments: AdjustmentLayers(userValues: {AdjustItem.exposure: 0.5}),
      );
      final first = resolve(async, r.preparer.prepare(photoBytes(), edit));
      expect(first.sizeBytes, 2000000);
      expect(first.edit, edit);
      r.renderer.edits.clear();
      r.api.policy(['posts-uploads__issued-small-max.json']);
      r.monotonic.advance(const Duration(seconds: 301));
      final again = resolve(async, r.preparer.refresh(first, photoBytes()));
      expect(again.policy.maxBytes, 1000000);
      expect(again.sizeBytes, 900000);
      expect(r.renderer.edits, [edit], reason: '저장한 편집값을 다시 적용');
      expect(identical(again.file, first.file), isFalse);
      expect((first.file as FakeStoredPhoto).deleted, isTrue);
      expect(r.files.live, 1);
    });

    fakeTest('TC-UPL-053 재발급 정책의 contentType이 image/webp가 아니면 업로드하지 않는다', (
      async,
    ) {
      final r = UploadRig();
      final first = resolve(
        async,
        r.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      r.api.policy(['posts-uploads__content-type-png.json']);
      r.monotonic.advance(const Duration(seconds: 301));
      final p = start(async, r.preparer.refresh(first, photoBytes()));
      advance(async, _wait);
      expect(_failure(p.error).message, Copy.uploadErrorPrepare);
      expect(r.api.putCalls, 0);
    });
  });

  group('모델', () {
    test('TC-UPL-049 TC-UPL-050 만료 경계는 expiresInSeconds - 5초이다', () {
      final policy = UploadPolicy(
        uploadId: 'u',
        uploadUrl: Uri.parse('https://example.test/x'),
        expiresInSeconds: 300,
        contentType: 'image/webp',
        maxBytes: 1,
      );
      final prepared = PreparedUpload(
        policy: policy,
        file: FakeStoredPhoto('/p', photoBytes()),
        sizeBytes: 1,
        edit: PhotoEdit.identity,
        issuedAt: const Duration(seconds: 10),
      );
      expect(
        prepared.isExpiredAt(const Duration(milliseconds: 304999)),
        isFalse,
      );
      expect(prepared.isExpiredAt(const Duration(seconds: 305)), isTrue);
      expect(prepared.isExpiredAt(const Duration(seconds: 400)), isTrue);
      expect(policy.isWebp, isTrue);
    });
  });
}
