import 'dart:io';

import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

ApiError errOf(Probe<Object?> p) => p.error! as ApiError;

void main() {
  const p = '$v1/x';

  Probe<Object?> get(NetHarness h, {String path = '/x'}) =>
      Probe(h.client.request<Object?>(ApiRequest.get(path), decode: (j) => j));

  group('응답 디코딩', () {
    netTest('TC-NET-005 200인데 JSON이 깨지면 InvalidResponse이고 크래시하지 않는다', (h, a) {
      h.adapter.on('GET', p, [
        FakeResponse.fixture('common/ok__malformed-json.json'),
      ]);
      final r = get(h);
      settle(a);
      expect(errOf(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-NET-006 본문이 필요한 API가 200 빈 본문이면 InvalidResponse다', (h, a) {
      h.adapter.on('GET', p, [
        FakeResponse.fixture('common/ok__empty-body.json'),
      ]);
      final r = get(h);
      settle(a);
      expect(errOf(r).isInvalidResponse, isTrue);
    });

    netTest('TC-NET-006 본문이 필요한 API가 204를 받아도 InvalidResponse다', (h, a) {
      h.adapter.on('GET', p, [const FakeResponse.empty(204)]);
      final r = get(h);
      settle(a);
      expect(errOf(r).isInvalidResponse, isTrue);
    });

    netTest('TC-NET-007 204는 본문을 디코딩하지 않고 성공한다', (h, a) {
      // fixture: auth/logout__no-content.json
      h.adapter.on('POST', '$v1/auth/logout', [
        const FakeResponse(status: 204, body: 'garbage<<not json>>'),
      ]);
      final r = Probe(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.post,
            '/auth/logout',
            body: {'refreshToken': 'rt'},
          ),
        ),
      );
      settle(a);
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-008 알 수 없는 JSON 필드는 무시한다', (h, a) {
      // fixture: common/ok__extra-fields.json
      h.adapter.on('GET', p, [
        ok({
          'id': 'a',
          'brandNewField': {'x': 1},
        }),
      ]);
      final r = Probe(
        h.client.request<String>(
          const ApiRequest.get('/x'),
          decode: (j) => NetHarness.asMap(j)['id']! as String,
        ),
      );
      settle(a);
      expect(r.value, 'a');
    });

    netTest(
      'TC-NET-009 TC-NET-010 decode가 던지는 필수 필드 누락·타입 불일치·알 수 없는 enum은 InvalidResponse다',
      (h, a) {
        // fixture: common/ok__missing-required.json, common/ok__unknown-enum.json
        h.adapter.on('GET', p, [
          ok({'status': 'NEW_STATUS'}),
        ]);
        final probes = <Probe<Object?>>[
          Probe(
            h.client.request<Object?>(
              const ApiRequest.get('/x'),
              decode: (j) => NetHarness.asMap(j)['id']! as String,
            ),
          ), // null cast
          Probe(
            h.client.request<Object?>(
              const ApiRequest.get('/x'),
              decode: (j) => throw const FormatException('unknown enum'),
            ),
          ),
          Probe(
            h.client.request<Object?>(
              const ApiRequest.get('/x'),
              decode: (j) => NetHarness.asMap(j)['status']! as int,
            ),
          ), // type
        ];
        settle(a);
        for (final pr in probes) {
          expect(errOf(pr).isInvalidResponse, isTrue);
        }
      },
    );

    netTest('TC-NET-010 nullable 필드는 null이든 생략이든 모두 허용된다', (h, a) {
      h.adapter.on('GET', p, [
        FakeResponse.json(200, {'a': null}),
        FakeResponse.json(200, <String, Object?>{}),
      ]);
      String? nullable(Object? j) => NetHarness.asMap(j)['a'] as String?;
      final r1 = Probe(
        h.client.request<String?>(const ApiRequest.get('/x'), decode: nullable),
      );
      settle(a);
      final r2 = Probe(
        h.client.request<String?>(const ApiRequest.get('/x'), decode: nullable),
      );
      settle(a);
      expect(r1.succeeded && r2.succeeded, isTrue);
      expect(r1.value, isNull);
      expect(r2.value, isNull);
    });

    netTest('TC-NET-011 Content-Type이 JSON이 아닌 200은 InvalidResponse다', (h, a) {
      h.adapter.on('GET', p, [
        FakeResponse.fixture('common/ok__wrong-content-type.json'),
      ]);
      final r = get(h);
      settle(a);
      expect(errOf(r).isInvalidResponse, isTrue);
    });

    netTest('TC-NET-011 charset이 붙은 application/json은 정상이다', (h, a) {
      h.adapter.on('GET', p, [
        const FakeResponse(
          body: '{"id":1}',
          contentType: 'application/json; charset=utf-8',
        ),
      ]);
      final r = get(h);
      settle(a);
      expect(r.succeeded, isTrue);
    });
  });

  group('오류 응답', () {
    netTest('TC-NET-001 400 BUSINESS_ERROR 본문을 ApiError로 던진다', (h, a) {
      h.adapter.on('GET', p, [FakeResponse.json(400, businessBody)]);
      final r = get(h);
      settle(a);
      final e = errOf(r);
      expect((e.status, e.errorCode), (400, ApiErrorCode.businessError));
      expect(e.message, businessBody['message']);
      expect(h.adapter.count('GET', p), 1);
    });

    netTest('TC-NET-004 HTML 게이트웨이 502는 status만 가진 오류다(GET은 재시도 후 마지막 오류)', (
      h,
      a,
    ) {
      h.adapter.on('GET', p, [
        FakeResponse.fixture('common/error__bad-gateway-html.json'),
      ]);
      final r = get(h);
      advance(a, const Duration(seconds: 5));
      final e = errOf(r);
      expect(e.status, 502);
      expect(e.errorCode, isNull);
    });

    netTest(
      'TC-NET-033 TC-NET-034 TC-NET-035 403, 404, 400 검증 오류는 재시도 없이 한 번에 실패한다',
      (h, a) {
        h.adapter.on('GET', '$v1/f', [
          FakeResponse.json(403, {
            'errorCode': 'FORBIDDEN',
            'message': '접근 권한이 없습니다.',
          }),
        ]);
        h.adapter.on('GET', '$v1/n', [
          FakeResponse.json(404, {
            'errorCode': 'BUSINESS_ERROR',
            'message': '요청한 API를 찾을 수 없습니다.',
          }),
        ]);
        h.adapter.on('GET', '$v1/v', [
          FakeResponse.json(400, {
            'errorCode': 'BUSINESS_ERROR',
            'message': 'date: 요청 값의 형식이 올바르지 않습니다.',
          }),
        ]);
        final rs = [get(h, path: '/f'), get(h, path: '/n'), get(h, path: '/v')];
        advance(a, const Duration(seconds: 5));
        expect(rs.map((r) => errOf(r).status), [403, 404, 400]);
        expect(h.adapter.requests, hasLength(3));
      },
      session: sessionAt(),
    );

    netTest('TC-NET-036 POST에서 500 INTERNAL_ERROR는 재시도 없이 오류가 된다', (h, a) {
      h.adapter.on('POST', '$v1/feedbacks', [
        FakeResponse.json(500, internalBody),
      ]);
      final r = Probe<Object?>(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.post,
            '/feedbacks',
            body: {'content': 'x'},
          ),
        ),
      );
      advance(a, const Duration(seconds: 5));
      final e = errOf(r);
      expect((e.status, e.errorCode), (500, ApiErrorCode.internalError));
      expect(h.adapter.count('POST', '$v1/feedbacks'), 1);
    });

    netTest('TC-NET-050 http로의 리다이렉트는 따라가지 않고 실패한다', (h, a) {
      h.adapter.on('GET', p, [
        const FakeResponse(
          status: 301,
          body: '',
          headers: {'location': 'http://evil.test/api/v1/x'},
        ),
      ]);
      final r = get(h);
      advance(a, const Duration(seconds: 5));
      expect(r.error, isA<ApiError>());
      expect(h.adapter.requests, hasLength(1));
      expect(h.adapter.requests.single.followRedirects, isFalse);
    });
  });

  group('요청 모양', () {
    netTest('TC-NET-054 본문이 있는 요청은 Content-Type·Accept가 application/json이다', (
      h,
      a,
    ) {
      h.adapter.on('POST', '$v1/feedbacks', [const FakeResponse.empty(204)]);
      Probe(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.post,
            '/feedbacks',
            body: {'content': '안녕'},
          ),
        ),
      );
      settle(a);
      final r = h.adapter.requests.single;
      expect(r.header('content-type'), startsWith('application/json'));
      expect(r.header('accept'), contains('application/json'));
      expect(r.jsonBody, {'content': '안녕'});
    });

    netTest('TC-NET-054 본문 없는 POST·PUT·DELETE는 본문을 보내지 않는다', (h, a) {
      for (final m in ['POST', 'PUT', 'DELETE']) {
        h.adapter.on(m, '$v1/n', [const FakeResponse.empty(204)]);
      }
      for (final m in [HttpMethod.post, HttpMethod.put, HttpMethod.delete]) {
        Probe(h.client.requestNoContent(ApiRequest(m, '/n')));
        settle(a);
      }
      expect(h.adapter.requests, hasLength(3));
      for (final r in h.adapter.requests) {
        expect(r.body == null || r.body!.isEmpty, isTrue, reason: r.method);
      }
    });

    netTest('TC-NET-053 쿼리는 그대로 URL 쿼리로 전달된다', (h, a) {
      h.adapter.on('GET', '$v1/posts', [ok()]);
      Probe(
        h.client.request<Object?>(
          const ApiRequest.get(
            '/posts',
            query: {
              'date': '2026-01-05',
              'page': '1',
              'pageSize': '20',
              'sort': 'latest',
            },
          ),
          decode: (j) => j,
        ),
      );
      settle(a);
      expect(h.adapter.requests.single.uri.queryParameters, {
        'date': '2026-01-05',
        'page': '1',
        'pageSize': '20',
        'sort': 'latest',
      });
    });

    netTest('TC-NET-058 base URL을 바꾸면 모든 요청이 그 주소로만 나간다', (h, a) {
      h.adapter.on('GET', '$v1/x', [ok()]);
      Probe(
        h.client.request<Object?>(const ApiRequest.get('/x'), decode: (j) => j),
      );
      settle(a);
      final u = h.adapter.requests.single.uri;
      expect((u.scheme, u.host, u.port), ('https', 'mock.test', 8443));
      expect(u.path, '$v1/x');
    }, baseUrl: 'https://mock.test:8443');
  });

  group('loopback mock 서버', () {
    netTest(
      'REQ-NET-004 http://10.0.2.2 기준 주소로 호출하면 요청이 그 주소로 나가고 토큰도 붙는다',
      (h, a) {
        h.adapter.on('GET', '$v1/x', [ok()]);
        Probe(
          h.client.request<Object?>(
            const ApiRequest.get('/x'),
            decode: (j) => j,
          ),
        );
        settle(a);
        final r = h.adapter.requests.single;
        expect(
          (r.uri.scheme, r.uri.host, r.uri.port),
          ('http', '10.0.2.2', 8080),
        );
        expect(r.header('authorization'), 'Bearer at1');
      },
      baseUrl: 'http://10.0.2.2:8080',
      session: sessionAt(),
    );
  });

  group('연결 오류 매핑', () {
    final cases = <String, FakeResponse>{
      '연결 타임아웃': const FakeResponse.fault(FakeFault.timeout),
      '연결 끊김': const FakeResponse.fault(FakeFault.disconnect),
      'DNS 실패': const FakeResponse.throwing(
        SocketException('Failed host lookup: api.test'),
      ),
      'TLS 오류': const FakeResponse.throwing(HandshakeException('bad cert')),
      '응답 지연 타임아웃': const FakeResponse(delay: Duration(seconds: 20)),
    };
    cases.forEach((name, resp) {
      netTest('TC-NET-045 $name는 모두 같은 Network 오류다', (h, a) {
        h.adapter.on('POST', '$v1/feedbacks', [resp]);
        final r = Probe<Object?>(
          h.client.requestNoContent(
            const ApiRequest(
              HttpMethod.post,
              '/feedbacks',
              body: {'content': 'x'},
            ),
          ),
        );
        advance(a, const Duration(seconds: 30));
        final e = errOf(r);
        expect(e.isNetwork, isTrue);
        expect(e.isCancelled, isFalse);
        expect(h.adapter.requests, hasLength(1));
      });
    });
  });
}
