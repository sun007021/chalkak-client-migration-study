import 'dart:typed_data';

import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:chalkak/core/network/network_config.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

void main() {
  const post = ApiRequest(
    HttpMethod.post,
    '/feedbacks',
    body: {'content': 'x'},
  );

  Probe<Object?> sendPost(NetHarness h) =>
      Probe<Object?>(h.client.requestNoContent(post));

  group('일반 API 타임아웃', () {
    netTest('TC-NET-043 요청에 연결 10초·응답 15초 타임아웃이 설정된다', (h, a) {
      h.adapter.on('GET', '$v1/x', [ok()]);
      Probe(
        h.client.request<Object?>(const ApiRequest.get('/x'), decode: (j) => j),
      );
      settle(a);
      final r = h.adapter.requests.single;
      expect(r.connectTimeout, NetworkConfig.connectTimeout);
      expect(r.receiveTimeout, NetworkConfig.receiveTimeout);
    });

    netTest('TC-NET-043 14.9초 만에 온 응답은 성공한다', (h, a) {
      h.adapter.on('POST', '$v1/feedbacks', [
        const FakeResponse.empty(204)
            .withDelay(const Duration(milliseconds: 14900)),
      ]);
      final r = sendPost(h);
      advance(a, const Duration(seconds: 15));
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-043 TC-NET-045 15.1초 걸리는 응답은 Network 오류로 실패한다', (h, a) {
      h.adapter.on('POST', '$v1/feedbacks', [
        const FakeResponse.empty(204)
            .withDelay(const Duration(milliseconds: 15100)),
      ]);
      final r = sendPost(h);
      advance(a, const Duration(seconds: 16));
      expect((r.error! as ApiError).isNetwork, isTrue);
    });

    netTest('TC-NET-043 연결에 10.1초 걸리면 Network 오류로 실패한다', (h, a) {
      h.adapter.on('POST', '$v1/feedbacks', [
        const FakeResponse(
          status: 204,
          body: '',
          connectDelay: Duration(milliseconds: 10100),
        ),
      ]);
      final r = sendPost(h);
      advance(a, const Duration(seconds: 11));
      expect((r.error! as ApiError).isNetwork, isTrue);
    });
  });

  group('presigned PUT', () {
    final url = Uri.parse(
      'https://bucket.s3.test/posts/u1.webp?X-Amz-Signature=sig&X-Amz-Expires=300',
    );
    final bytes = Uint8List.fromList([1, 2, 3, 4]);

    netTest('TC-NET-044 Authorization·앱 공통 헤더 없이 정책의 Content-Type으로 PUT한다', (
      h,
      a,
    ) {
      h.adapter.on('PUT', '/posts/u1.webp', [const FakeResponse.empty(200)]);
      final r = Probe(
        h.client.putPresigned(
          url: url,
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.uri.host, 'bucket.s3.test');
      expect(req.uri.queryParameters['X-Amz-Signature'], 'sig');
      expect(req.header('content-type'), 'image/webp');
      expect(req.hasAuthorization, isFalse);
      expect(req.header('accept'), isNull);
      expect(
        req.headers.keys.toSet().difference({'content-type', 'content-length'}),
        isEmpty,
      );
    }, session: sessionAt());

    netTest('TC-NET-044 사인 PNG도 image/png로 보낸다', (h, a) {
      h.adapter.on('PUT', '/posts/u1.webp', [const FakeResponse.empty(200)]);
      Probe(
        h.client.putPresigned(url: url, bytes: bytes, contentType: 'image/png'),
      );
      settle(a);
      expect(h.adapter.requests.single.header('content-type'), 'image/png');
    });

    netTest('TC-NET-044 타임아웃은 연결·응답 모두 60초다', (h, a) {
      h.adapter.on('PUT', '/posts/u1.webp', [const FakeResponse.empty(200)]);
      Probe(
        h.client.putPresigned(
          url: url,
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      settle(a);
      final req = h.adapter.requests.single;
      expect(req.connectTimeout, NetworkConfig.presignedPutTimeout);
      expect(req.receiveTimeout, NetworkConfig.presignedPutTimeout);
    });

    netTest('TC-NET-044 59초 응답은 성공, 61초 응답은 Network 오류다', (h, a) {
      h.adapter.on('PUT', '/posts/u1.webp', [
        const FakeResponse.empty(200).withDelay(const Duration(seconds: 59)),
      ]);
      final ok59 = Probe(
        h.client.putPresigned(
          url: url,
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      advance(a, const Duration(seconds: 60));
      expect(ok59.succeeded, isTrue);

      h.adapter.on('PUT', '/posts/u2.webp', [
        const FakeResponse.empty(200).withDelay(const Duration(seconds: 61)),
      ]);
      final slow = Probe(
        h.client.putPresigned(
          url: Uri.parse(
            'https://bucket.s3.test/posts/u2.webp?X-Amz-Signature=s',
          ),
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      // PUT은 멱등이라 타임아웃을 두 번 재시도한다(D-21): 60s + 0.5s + 60s + 1s + 60s.
      advance(a, const Duration(seconds: 200));
      expect((slow.error! as ApiError).isNetwork, isTrue);
    });

    netTest(
      'TC-NET-037 TC-NET-044 presigned PUT은 멱등이라 5xx에 0.5초 뒤 같은 본문으로 재시도한다',
      (h, a) {
        h.adapter.on('PUT', '/posts/u1.webp', [
          FakeResponse.json(503, internalBody),
          const FakeResponse.empty(200),
        ]);
        final r = Probe(
          h.client.putPresigned(
            url: url,
            bytes: bytes,
            contentType: 'image/webp',
          ),
        );
        advance(a, const Duration(milliseconds: 499));
        expect(h.adapter.requests, hasLength(1));
        advance(a, const Duration(milliseconds: 1));
        expect(r.succeeded, isTrue);
        expect(h.adapter.requests, hasLength(2));
        for (final req in h.adapter.requests) {
          expect(req.header('content-type'), 'image/webp');
          expect(req.hasAuthorization, isFalse);
          expect(req.uri.queryParameters['X-Amz-Signature'], 'sig');
        }
      },
      session: sessionAt(),
    );

    netTest('TC-NET-037 presigned PUT도 4xx는 재시도하지 않고 5xx가 계속되면 총 3시도 뒤 실패한다', (
      h,
      a,
    ) {
      h.adapter.on('PUT', '/posts/denied.webp', [
        const FakeResponse.empty(403),
      ]);
      h.adapter.on('PUT', '/posts/down.webp', [const FakeResponse.empty(500)]);
      final denied = Probe(
        h.client.putPresigned(
          url: Uri.parse('https://bucket.s3.test/posts/denied.webp?X=1'),
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      final down = Probe(
        h.client.putPresigned(
          url: Uri.parse('https://bucket.s3.test/posts/down.webp?X=1'),
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      advance(a, const Duration(seconds: 30));
      expect((denied.error! as ApiError).status, 403);
      expect((down.error! as ApiError).status, 500);
      expect(h.adapter.count('PUT', '/posts/denied.webp'), 1);
      expect(h.adapter.count('PUT', '/posts/down.webp'), 3);
    });

    netTest('REQ-NET-004 loopback 호스트의 http presigned URL(mock 서버)은 허용한다', (
      h,
      a,
    ) {
      h.adapter.on('PUT', '/posts/u1.webp', [const FakeResponse.empty(200)]);
      for (final host in [
        'localhost:9000',
        '127.0.0.1:9000',
        '10.0.2.2:9000',
      ]) {
        Probe(
          h.client.putPresigned(
            url: Uri.parse('http://$host/posts/u1.webp?X-Amz-Signature=sig'),
            bytes: bytes,
            contentType: 'image/webp',
          ),
        );
      }
      settle(a);
      expect(h.adapter.requests, hasLength(3));
    });

    netTest(
      'REQ-NET-001 loopback이 아닌 http presigned URL은 요청 없이 invalidResponse다',
      (h, a) {
        final r = Probe(
          h.client.putPresigned(
            url: Uri.parse(
              'http://bucket.s3.test/posts/u1.webp?X-Amz-Signature=s',
            ),
            bytes: bytes,
            contentType: 'image/webp',
          ),
        );
        settle(a);
        expect((r.error! as ApiError).isInvalidResponse, isTrue);
        expect(h.adapter.requests, isEmpty);
      },
    );

    netTest('TC-NET-044 저장소가 403(XML 본문)을 주면 status를 가진 server 오류다', (h, a) {
      h.adapter.on('PUT', '/posts/u1.webp', [
        const FakeResponse(
          status: 403,
          body: '<Error><Code>AccessDenied</Code></Error>',
          contentType: 'application/xml',
        ),
      ]);
      final r = Probe(
        h.client.putPresigned(
          url: url,
          bytes: bytes,
          contentType: 'image/webp',
        ),
      );
      advance(a, const Duration(seconds: 5));
      final e = r.error! as ApiError;
      expect((e.kind, e.status), (ApiErrorKind.server, 403));
    });
  });
}
