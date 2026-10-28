import 'dart:typed_data';

import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/domain/upload_models.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, t0, v1;
import '../../../support/upload_fakes.dart';

const _id1 = '55555555-5555-4555-8555-555555555501';
final _policy = UploadPolicy(
  uploadId: _id1,
  uploadUrl: Uri.parse(
    'http://localhost:4010/__upload/$_id1?X-Amz-Expires=300',
  ),
  expiresInSeconds: 300,
  contentType: 'image/webp',
  maxBytes: 5242880,
);
const _wait = Duration(seconds: 130);

void main() {
  group('정책 발급 (POST /posts/uploads)', () {
    fakeTest('TC-UPL-023 요청은 POST, 본문 없음, Authorization 있음이다', (async) {
      final r = UploadRig();
      resolve(async, r.repository.requestPolicy());
      final req = r.http.adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '$v1/posts/uploads');
      expect(req.body ?? '', isEmpty);
      expect(req.hasAuthorization, isTrue);
    });

    fakeTest('TC-UPL-024 응답에서 다섯 필드를 읽는다', (async) {
      final r = UploadRig();
      final p = resolve(async, r.repository.requestPolicy());
      expect(p.uploadId, _id1);
      expect(p.uploadUrl.path, '/__upload/$_id1');
      expect(p.expiresInSeconds, 300);
      expect(p.contentType, 'image/webp');
      expect(p.maxBytes, 5242880);
    });

    fakeTest('TC-UPL-024 maxBytes는 64비트 정수로 보존한다', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__issued-large-max.json']);
      final p = resolve(async, r.repository.requestPolicy());
      expect(p.maxBytes, 5000000000);
    });

    fakeTest('TC-UPL-026 필수 필드가 없으면 계약 위반(invalidResponse)이다', (async) {
      final r = UploadRig()..api.policy(['posts-uploads__missing-fields.json']);
      final p = start(async, r.repository.requestPolicy());
      expect(p.error, isA<ApiError>());
      expect((p.error! as ApiError).isInvalidResponse, isTrue);
    });

    fakeTest('TC-UPL-027 403은 forbidden이고 재요청하지 않는다', (async) {
      final r = UploadRig()..api.policy(['posts-uploads__403-banned.json']);
      final p = start(async, r.repository.requestPolicy());
      advance(async, _wait);
      expect((p.error! as ApiError).errorCode, ApiErrorCode.forbidden);
      expect(r.api.policyCalls, 1);
    });

    fakeTest('TC-UPL-027 500은 0.5초·1초 간격으로 최대 2회 재시도한다(멱등 발급)', (async) {
      final r = UploadRig()
        ..api.policy(['posts-uploads__500-server-error.json']);
      final p = start(async, r.repository.requestPolicy());
      advance(async, _wait);
      expect(p.error, isA<ApiError>());
      final times = r.http.adapter
          .where('POST', '$v1/posts/uploads')
          .map((q) => q.at.difference(t0).inMilliseconds);
      expect(times, [0, 500, 1500]);
    });

    fakeTest('TC-UPL-027 401은 refresh 후 1회 재전송한다', (async) {
      final r = UploadRig()
        ..api.policy([
          'posts-uploads__401-unauthorized.json',
          'posts-uploads__issued.json',
        ]);
      final p = resolve(async, r.repository.requestPolicy());
      expect(p.uploadId, _id1);
      expect(r.api.policyCalls, 2);
      expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
    });
  });

  group('presigned PUT', () {
    final bytes = Uint8List.fromList(List<int>.generate(2048, (i) => i & 0xff));

    fakeTest('TC-UPL-054 PUT은 인증 헤더 없이 정책 Content-Type과 본문 그대로 보낸다', (async) {
      final r = UploadRig();
      resolve(async, r.repository.putImage(_policy, bytes));
      final req = r.api.puts.single;
      expect(req.method, 'PUT');
      expect(req.path, '/__upload/$_id1');
      expect(req.hasAuthorization, isFalse);
      expect(req.header('content-type'), 'image/webp');
      expect(req.bodyBytes, bytes);
    });

    fakeTest('TC-UPL-055 S3 403은 오류이고 재시도하지 않는다', (async) {
      final r = UploadRig()..api.put(['s3-put__403-signature-mismatch.json']);
      final p = start(async, r.repository.putImage(_policy, bytes));
      advance(async, _wait);
      expect((p.error! as ApiError).status, 403);
      expect(r.api.putCalls, 1);
    });

    fakeTest('TC-UPL-055 S3 5xx는 0.5초·1초 간격으로 최대 2회 재시도한다(멱등 PUT)', (async) {
      final r = UploadRig()..api.put(['s3-put__500-server-error.json']);
      final p = start(async, r.repository.putImage(_policy, bytes));
      advance(async, _wait);
      expect((p.error! as ApiError).status, 500);
      expect(r.api.puts.map((q) => q.at.difference(t0).inMilliseconds), [
        0,
        500,
        1500,
      ]);
    });

    fakeTest('TC-UPL-055 연결 실패는 network 오류이다', (async) {
      final r = UploadRig();
      r.api.putResponses(const [FakeResponse.fault(FakeFault.disconnect)]);
      final p = start(async, r.repository.putImage(_policy, bytes));
      advance(async, _wait);
      expect((p.error! as ApiError).isNetwork, isTrue);
    });

    fakeTest('TC-UPL-056 http:// 업로드 URL은 요청 없이 실패한다', (async) {
      final r = UploadRig();
      final insecure = UploadPolicy(
        uploadId: _id1,
        uploadUrl: Uri.parse('http://upload.example.test/x?X-Amz-Expires=300'),
        expiresInSeconds: 300,
        contentType: 'image/webp',
        maxBytes: 5242880,
      );
      final p = start(async, r.repository.putImage(insecure, bytes));
      expect((p.error! as ApiError).isInvalidResponse, isTrue);
      expect(r.http.adapter.requests, isEmpty);
    });

    fakeTest('TC-UPL-057 응답이 61초 지연되면 60초 제한으로 실패한다', (async) {
      final r = UploadRig()
        ..api.put(['s3-put__200.json'], delay: const Duration(seconds: 61));
      final p = start(async, r.repository.putImage(_policy, bytes));
      advance(async, const Duration(seconds: 61));
      final first = r.api.puts.first;
      expect(first.receiveTimeout, const Duration(seconds: 60));
      advance(async, const Duration(minutes: 5));
      expect((p.error! as ApiError).isNetwork, isTrue);
    });
  });

  group('게시물 생성 (POST /posts)', () {
    fakeTest(
      'TC-UPL-059 본문은 {topicId, photoUploadId, title}이고 Authorization이 있다',
      (async) {
        final r = UploadRig();
        final post = resolve(
          async,
          r.repository.createPost(
            topicId: 'topic-1',
            uploadId: _id1,
            title: '가을',
          ),
        );
        final req = r.api.creates.single;
        expect(req.path, '$v1/posts');
        expect(req.jsonBody, {
          'topicId': 'topic-1',
          'photoUploadId': _id1,
          'title': '가을',
        });
        expect(req.hasAuthorization, isTrue);
        expect(post.moderationStatus, ModerationStatus.pending);
      },
    );

    fakeTest('TC-UPL-082 제목이 없으면 title은 null(또는 생략)이다', (async) {
      final r = UploadRig();
      resolve(
        async,
        r.repository.createPost(topicId: 'topic-1', uploadId: _id1),
      );
      expect(r.api.creates.single.jsonBody!['title'], isNull);
    });

    fakeTest('TC-UPL-060 VALIDATING도 받아들인다', (async) {
      final r = UploadRig()..api.create(['posts-create__201-validating.json']);
      final post = resolve(
        async,
        r.repository.createPost(topicId: 't', uploadId: _id1),
      );
      expect(post.moderationStatus, ModerationStatus.validating);
    });

    fakeTest('TC-UPL-061 알 수 없는 moderationStatus는 계약 위반(invalidResponse)이다', (
      async,
    ) {
      final r = UploadRig()
        ..api.create(['posts-create__201-unknown-status.json']);
      final p = start(
        async,
        r.repository.createPost(topicId: 't', uploadId: _id1),
      );
      expect((p.error! as ApiError).isInvalidResponse, isTrue);
    });

    fakeTest('TC-UPL-068 500은 자동 재시도 없이 1회만 보낸다', (async) {
      final r = UploadRig()
        ..api.create(['posts-create__500-server-error.json']);
      final p = start(
        async,
        r.repository.createPost(topicId: 't', uploadId: _id1),
      );
      advance(async, _wait);
      expect((p.error! as ApiError).status, 500);
      expect(r.api.createCalls, 1);
    });

    fakeTest('TC-UPL-069 응답 유실(타임아웃)은 network 오류이고 재전송하지 않는다', (async) {
      final r = UploadRig()..api.create(['posts-create__timeout.json']);
      final p = start(
        async,
        r.repository.createPost(topicId: 't', uploadId: _id1),
      );
      advance(async, _wait);
      expect((p.error! as ApiError).isNetwork, isTrue);
      expect(r.api.createCalls, 1);
    });
  });
}
