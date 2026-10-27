import 'dart:io';

import 'package:clock/clock.dart';

import 'api_request.dart';
import 'network_config.dart';

class RetryPolicy {
  const RetryPolicy._();

  static const Set<String> _idempotentPosts = {
    '/posts/uploads',
    '/users/me/signature/uploads',
  };

  /// D-21. GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST만 true.
  /// [path]는 `/api/v1` 뒤 경로(쿼리 제외). 그 밖의 POST는 모두 false.
  static bool isRetryable(HttpMethod method, String path) =>
      method != HttpMethod.post || _idempotentPosts.contains(path);

  /// Retry-After(초 정수 또는 HTTP 날짜)를 대기 시간으로 바꾼다.
  /// 음수·비숫자·과거 날짜·없음은 null(무시), 상한 초과는 maxRetryAfter로 자른다.
  /// [now]를 생략하면 `clock.now()`.
  static Duration? parseRetryAfter(String? value, {DateTime? now}) {
    final text = value?.trim();
    if (text == null || text.isEmpty) return null;
    Duration? wait;
    if (RegExp(r'^[0-9]+$').hasMatch(text)) {
      final seconds = int.tryParse(text);
      // 정수 오버플로는 아주 큰 값이므로 상한으로 자른다.
      wait = seconds == null
          ? NetworkConfig.maxRetryAfter
          : Duration(seconds: seconds.clamp(0, 1 << 30));
    } else {
      try {
        final at = HttpDate.parse(text);
        final diff = at.difference((now ?? clock.now()).toUtc());
        if (diff.isNegative) return null;
        wait = diff;
      } on HttpException {
        return null;
      } on FormatException {
        return null;
      }
    }
    return wait > NetworkConfig.maxRetryAfter
        ? NetworkConfig.maxRetryAfter
        : wait;
  }
}
