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
      advance(a, const Duration(seconds: 62));
      expect((slow.error! as ApiError).isNetwork, isTrue);
    });

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
