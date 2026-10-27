import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_adapter.dart';

/// FakeAdapter 자체 점검. 구현 없이도 통과해야 한다.
void main() {
  Dio dioWith(FakeAdapter a) => Dio(
    BaseOptions(
      baseUrl: 'https://api.test/api/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      validateStatus: (_) => true,
    ),
  )..httpClientAdapter = a;

  test('요청을 기록하고 스크립트 순서대로 응답한다(마지막은 반복)', () {
    fakeAsync((async) {
      final a = FakeAdapter()
        ..on('GET', '/api/v1/x', [
          const FakeResponse.empty(500),
          FakeResponse.json(200, {'a': 1}),
        ]);
      final d = dioWith(a);
      final codes = <int?>[];
      for (var i = 0; i < 3; i++) {
        d.get<dynamic>('/x').then((r) => codes.add(r.statusCode));
        async.elapse(Duration.zero);
      }
      expect(codes, [500, 200, 200]);
      expect(a.requests, hasLength(3));
    });
  });

  test('receiveTimeout보다 긴 응답 지연은 receiveTimeout 예외, 가상 시간만 소비', () {
    fakeAsync((async) {
      final a = FakeAdapter()
        ..on('GET', '/api/v1/slow', [
          FakeResponse.json(
            200,
            {},
          ).withDelay(const Duration(milliseconds: 15100)),
        ]);
      final d = dioWith(a);
      DioExceptionType? type;
      d
          .get<dynamic>('/slow')
          .then(
            (_) {},
            onError: (Object e) {
              type = (e as DioException).type;
            },
          );
      async.elapse(const Duration(seconds: 14));
      expect(type, isNull);
      async.elapse(const Duration(seconds: 2));
      expect(type, DioExceptionType.receiveTimeout);
    });
  });

  test('취소하면 대기 중이던 요청이 cancel 예외로 끝난다', () {
    fakeAsync((async) {
      final a = FakeAdapter()
        ..on('GET', '/api/v1/slow', [
          FakeResponse.json(200, {}).withDelay(const Duration(seconds: 5)),
        ]);
      final d = dioWith(a);
      final token = CancelToken();
      DioExceptionType? type;
      d
          .get<dynamic>('/slow', cancelToken: token)
          .then(
            (_) {},
            onError: (Object e) {
              type = (e as DioException).type;
            },
          );
      async.elapse(const Duration(seconds: 1));
      token.cancel();
      async.flushMicrotasks();
      expect(type, DioExceptionType.cancel);
    });
  });

  test('fixture 예약 키와 manifest 상태·헤더를 응답으로 옮긴다', () {
    final html = FakeResponse.fixture('common/error__bad-gateway-html.json');
    expect(html.status, 502);
    expect(html.contentType, 'text/html');
    expect(html.body, startsWith('<html>'));
    final limited = FakeResponse.fixture('common/error__rate-limited-429.json');
    expect((limited.status, limited.headers['Retry-After']), (429, '2'));
    expect(FakeResponse.fixture('common/ok__empty-body.json').body, isEmpty);
  });
}
