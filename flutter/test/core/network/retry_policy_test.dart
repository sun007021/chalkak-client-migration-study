import 'dart:io';

import 'package:chalkak/core/network/api_request.dart';
import 'package:chalkak/core/network/network_config.dart';
import 'package:chalkak/core/network/retry_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('재시도 대상 분류', () {
    const retryable = <(HttpMethod, String)>[
      (HttpMethod.get, '/posts'),
      (HttpMethod.get, '/topics'),
      (HttpMethod.get, '/posts/today'),
      (HttpMethod.get, '/notifications'),
      (HttpMethod.put, '/push-devices/current'),
      (HttpMethod.put, '/users/me/signature'),
      (HttpMethod.delete, '/users/me'),
      (HttpMethod.delete, '/posts/0b0f9c9e-0000-4000-8000-000000000001'),
      (HttpMethod.patch, '/notification-settings'),
      (HttpMethod.post, '/posts/uploads'),
      (HttpMethod.post, '/users/me/signature/uploads'),
    ];
    const notRetryable = <(HttpMethod, String)>[
      (HttpMethod.post, '/posts'),
      (HttpMethod.post, '/auth/refresh'),
      (HttpMethod.post, '/feedbacks'),
      (
        HttpMethod.post,
        '/posts/0b0f9c9e-0000-4000-8000-000000000001/ai-review',
      ),
      (HttpMethod.post, '/auth/social-login'),
      (HttpMethod.post, '/auth/social-signup/signature/uploads'),
      (HttpMethod.post, '/auth/social-signup'),
      (HttpMethod.post, '/auth/logout'),
      // 목록에 없는 POST는 기본 비재시도
      (HttpMethod.post, '/posts/0b0f9c9e-0000-4000-8000-000000000001/likes'),
    ];

    test('TC-NET-037 멱등 요청은 재시도 대상이다', () {
      for (final (m, p) in retryable) {
        expect(RetryPolicy.isRetryable(m, p), isTrue, reason: '${m.wire} $p');
      }
    });

    test('TC-NET-038 비멱등 POST는 /auth/social-* 포함 전부 재시도하지 않는다', () {
      for (final (m, p) in notRetryable) {
        expect(RetryPolicy.isRetryable(m, p), isFalse, reason: '${m.wire} $p');
      }
    });
  });

  group('Retry-After 해석', () {
    final now = DateTime.utc(2026, 10, 27, 3);

    test('TC-NET-040 초 정수는 그 시간만큼 기다린다', () {
      expect(
        RetryPolicy.parseRetryAfter('2', now: now),
        const Duration(seconds: 2),
      );
      expect(RetryPolicy.parseRetryAfter('0', now: now), Duration.zero);
    });

    test('TC-NET-040 HTTP 날짜는 now와의 차이만큼 기다린다', () {
      final header = HttpDate.format(now.add(const Duration(seconds: 3)));
      expect(
        RetryPolicy.parseRetryAfter(header, now: now),
        const Duration(seconds: 3),
      );
    });

    test('TC-NET-041 음수, 비숫자, 과거 날짜, 없음은 무시(null)한다', () {
      final past = HttpDate.format(now.subtract(const Duration(minutes: 5)));
      for (final v in <String?>[null, '', '-1', '-5', 'abc', '1.5x', past]) {
        expect(RetryPolicy.parseRetryAfter(v, now: now), isNull, reason: '$v');
      }
    });

    test('TC-NET-041 매우 큰 값은 maxRetryAfter로 자른다', () {
      expect(
        RetryPolicy.parseRetryAfter('99999', now: now),
        NetworkConfig.maxRetryAfter,
      );
      final far = HttpDate.format(now.add(const Duration(days: 3)));
      expect(
        RetryPolicy.parseRetryAfter(far, now: now),
        NetworkConfig.maxRetryAfter,
      );
    });
  });

  test('D-21 백오프는 0.5초, 1초이고 최대 재시도는 2회다', () {
    expect(NetworkConfig.retryBackoffs, [
      const Duration(milliseconds: 500),
      const Duration(seconds: 1),
    ]);
  });

  test('TC-NET-043 TC-NET-044 타임아웃 상수는 연결 10초·응답 15초·presigned 60초다', () {
    expect(NetworkConfig.connectTimeout, const Duration(seconds: 10));
    expect(NetworkConfig.receiveTimeout, const Duration(seconds: 15));
    expect(NetworkConfig.presignedPutTimeout, const Duration(seconds: 60));
  });
}
