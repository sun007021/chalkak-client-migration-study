import 'dart:io';

import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:chalkak/core/network/network_config.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

ApiError errOf(Probe<Object?> p) => p.error! as ApiError;

Probe<Object?> send(NetHarness h, ApiRequest r, {CancelToken? cancel}) =>
    Probe<Object?>(
      h.client.request<Object?>(r, decode: (j) => j, cancelToken: cancel),
    );

List<Duration> offsets(NetHarness h) =>
    h.adapter.requests.map((r) => r.at.difference(t0)).toList();

void main() {
  const getX = ApiRequest.get('/x');
  const ms500 = Duration(milliseconds: 500);

  group('멱등 요청 재시도', () {
    netTest('TC-NET-037 5xx가 계속되면 0.5초, 1초 간격으로 총 3시도 뒤 실패한다', (h, a) {
      h.adapter.on('GET', '$v1/x', [FakeResponse.json(500, internalBody)]);
      final r = send(h, getX);
      settle(a);
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 499));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(h.adapter.requests, hasLength(2));
      advance(a, const Duration(milliseconds: 999));
      expect(h.adapter.requests, hasLength(2));
      expect(r.done, isFalse);
      advance(a, const Duration(milliseconds: 1));
      expect(h.adapter.requests, hasLength(3));
      advance(a, const Duration(seconds: 30));
      expect(h.adapter.requests, hasLength(3));
      expect(offsets(h), [
        Duration.zero,
        ms500,
        const Duration(milliseconds: 1500),
      ]);
      expect(errOf(r).status, 500);
    });

    netTest('TC-NET-037 네트워크 오류 뒤 재시도가 성공하면 결과를 돌려준다', (h, a) {
      h.adapter.on('GET', '$v1/x', [
        const FakeResponse.fault(FakeFault.disconnect),
        ok({'v': 1}),
      ]);
      final r = send(h, getX);
      advance(a, const Duration(seconds: 2));
      expect(r.succeeded, isTrue);
      expect(h.adapter.requests, hasLength(2));
    });

    netTest('TC-NET-037 PUT, DELETE, PATCH, 업로드 정책 발급 POST도 3시도한다', (h, a) {
      final reqs = <(String, ApiRequest)>[
        ('PUT', const ApiRequest(HttpMethod.put, '/p', body: {'a': 1})),
        ('DELETE', const ApiRequest(HttpMethod.delete, '/d')),
        ('PATCH', const ApiRequest(HttpMethod.patch, '/pa', body: {'a': 1})),
        (
          'POST',
          const ApiRequest(HttpMethod.post, '/posts/uploads', body: {'a': 1}),
        ),
        (
          'POST',
          const ApiRequest(
            HttpMethod.post,
            '/users/me/signature/uploads',
            body: {'a': 1},
          ),
        ),
      ];
      for (final (m, r) in reqs) {
        h.adapter.on(m, '$v1${r.path}', [FakeResponse.json(500, internalBody)]);
      }
      for (final (_, r) in reqs) {
        send(h, r);
      }
      advance(a, const Duration(seconds: 30));
      for (final (m, r) in reqs) {
        expect(h.adapter.count(m, '$v1${r.path}'), 3, reason: '$m ${r.path}');
      }
    });

    netTest('TC-NET-038 비멱등 POST는 5xx와 네트워크 오류에서도 시도 1회다(표 기반)', (h, a) {
      const paths = [
        '/posts',
        '/auth/refresh',
        '/feedbacks',
        '/posts/0b0f9c9e-0000-4000-8000-000000000001/ai-review',
        '/auth/social-login',
        '/auth/social-signup/signature/uploads',
        '/auth/social-signup',
        '/auth/logout',
      ];
      for (final p in paths) {
        h.adapter.on('POST', '$v1$p', [FakeResponse.json(500, internalBody)]);
        send(h, ApiRequest(HttpMethod.post, p, body: const {'a': 1}));
      }
      advance(a, const Duration(seconds: 30));
      for (final p in paths) {
        expect(h.adapter.count('POST', '$v1$p'), 1, reason: p);
      }
    });

    netTest('TC-NET-038 비멱등 POST가 네트워크 오류여도 재시도하지 않는다', (h, a) {
      h.adapter.on('POST', '$v1/posts', [
        const FakeResponse.fault(FakeFault.timeout),
      ]);
      final r = send(
        h,
        const ApiRequest(HttpMethod.post, '/posts', body: {'a': 1}),
      );
      advance(a, const Duration(seconds: 60));
      expect(errOf(r).isNetwork, isTrue);
      expect(h.adapter.requests, hasLength(1));
    });

    netTest('TC-NET-039 멱등 요청도 4xx(400, 403, 404)는 재시도하지 않는다', (h, a) {
      for (final s in [400, 403, 404]) {
        h.adapter.on('GET', '$v1/c$s', [FakeResponse.json(s, businessBody)]);
        send(h, ApiRequest.get('/c$s'));
      }
      advance(a, const Duration(seconds: 30));
      for (final s in [400, 403, 404]) {
        expect(h.adapter.count('GET', '$v1/c$s'), 1, reason: '$s');
      }
    }, session: sessionAt());
  });

  group('Retry-After', () {
    // 상태·본문은 fixture, Retry-After 값만 케이스가 정한다.
    FakeResponse limited(int status, String retryAfter) => FakeResponse.fixture(
      status == 429
          ? 'common/error__rate-limited-429.json'
          : 'common/error__service-unavailable-503.json',
      headers: {'Retry-After': retryAfter},
    );

    netTest('TC-NET-040 503 Retry-After: 2는 0.5초가 아니라 2초 뒤 재시도한다', (h, a) {
      h.adapter.on('GET', '$v1/x', [limited(503, '2'), ok()]);
      final r = send(h, getX);
      advance(a, const Duration(milliseconds: 1999));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(h.adapter.requests, hasLength(2));
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-040 429 Retry-After: 1은 1초 뒤 재시도한다', (h, a) {
      h.adapter.on('GET', '$v1/x', [limited(429, '1'), ok()]);
      final r = send(h, getX);
      advance(a, const Duration(milliseconds: 999));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-040 HTTP 날짜 형식 Retry-After도 그만큼 기다린다', (h, a) {
      final date = HttpDate.format(t0.add(const Duration(seconds: 3)));
      h.adapter.on('GET', '$v1/x', [limited(503, date), ok()]);
      final r = send(h, getX);
      advance(a, const Duration(milliseconds: 2999));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-040 Retry-After 재시도도 최대 2회 안에서 센다(총 3시도)', (h, a) {
      h.adapter.on('GET', '$v1/x', [limited(503, '1')]);
      final r = send(h, getX);
      advance(a, const Duration(seconds: 60));
      expect(h.adapter.requests, hasLength(3));
      expect(offsets(h), [
        Duration.zero,
        const Duration(seconds: 1),
        const Duration(seconds: 2),
      ]);
      expect(errOf(r).status, 503);
    });

    for (final bad in ['-5', 'abc', 'Wed, 21 Oct 2015 07:28:00 GMT']) {
      netTest('TC-NET-041 잘못된 Retry-After("$bad")는 무시하고 기본 백오프(0.5초)를 쓴다', (
        h,
        a,
      ) {
        h.adapter.on('GET', '$v1/x', [limited(503, bad), ok()]);
        final r = send(h, getX);
        advance(a, const Duration(milliseconds: 499));
        expect(h.adapter.requests, hasLength(1));
        advance(a, const Duration(milliseconds: 1));
        expect(h.adapter.requests, hasLength(2));
        expect(r.succeeded, isTrue);
      });
    }

    netTest('TC-NET-041 매우 큰 Retry-After는 maxRetryAfter를 넘지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/x', [limited(503, '99999'), ok()]);
      final r = send(h, getX);
      advance(a, NetworkConfig.maxRetryAfter);
      expect(h.adapter.requests, hasLength(2));
      expect(r.succeeded, isTrue);
    });

    netTest('TC-NET-042 429가 비멱등 POST에 오면 기다림·재시도 없이 실패한다', (h, a) {
      h.adapter.on('POST', '$v1/posts', [limited(429, '2')]);
      final r = send(
        h,
        const ApiRequest(HttpMethod.post, '/posts', body: {'a': 1}),
      );
      settle(a);
      expect(r.done, isTrue); // 시간을 흘리지 않아도 이미 실패
      expect(errOf(r).status, 429);
      advance(a, const Duration(seconds: 30));
      expect(h.adapter.requests, hasLength(1));
    });

    netTest('TC-NET-042 Retry-After 없는 429는 GET이어도 재시도하지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/x', [FakeResponse.json(429, businessBody)]);
      final r = send(h, getX);
      advance(a, const Duration(seconds: 30));
      expect(errOf(r).status, 429);
      expect(h.adapter.requests, hasLength(1));
    });
  });

  group('취소', () {
    netTest('TC-NET-048 요청 도중 취소하면 cancelled 오류이며 Network 오류가 아니다', (h, a) {
      h.adapter.on('GET', '$v1/x', [
        ok().withDelay(const Duration(seconds: 5)),
      ]);
      final token = CancelToken();
      final r = send(h, getX, cancel: token);
      advance(a, const Duration(seconds: 1));
      expect(r.done, isFalse);
      token.cancel();
      settle(a);
      final e = errOf(r);
      expect(e.isCancelled, isTrue);
      expect(e.isNetwork, isFalse);
      advance(a, const Duration(seconds: 30));
      expect(h.adapter.requests, hasLength(1));
    });

    netTest('TC-NET-048 요청 시작 전에 이미 취소된 토큰이면 요청을 보내지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/x', [ok()]);
      final token = CancelToken()..cancel();
      final r = send(h, getX, cancel: token);
      settle(a);
      expect(errOf(r).isCancelled, isTrue);
      expect(h.adapter.requests, isEmpty);
    });

    netTest('TC-NET-049 재시도 백오프 대기 중 취소하면 즉시 중단하고 추가 요청이 없다', (h, a) {
      h.adapter.on('GET', '$v1/x', [FakeResponse.json(500, internalBody)]);
      final token = CancelToken();
      final r = send(h, getX, cancel: token);
      advance(a, const Duration(milliseconds: 200));
      expect(h.adapter.requests, hasLength(1));
      expect(r.done, isFalse);
      token.cancel();
      settle(a);
      expect(errOf(r).isCancelled, isTrue);
      advance(a, const Duration(seconds: 30));
      expect(h.adapter.requests, hasLength(1));
    });
  });
}
