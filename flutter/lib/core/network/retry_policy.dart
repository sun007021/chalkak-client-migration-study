import 'api_request.dart';

class RetryPolicy {
  const RetryPolicy._();

  /// D-21. GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST만 true.
  /// [path]는 `/api/v1` 뒤 경로(쿼리 제외). 그 밖의 POST는 모두 false.
  static bool isRetryable(HttpMethod method, String path) =>
      throw UnimplementedError();

  /// Retry-After(초 정수 또는 HTTP 날짜)를 대기 시간으로 바꾼다.
  /// 음수·비숫자·과거 날짜·없음은 null(무시), 상한 초과는 maxRetryAfter로 자른다.
  static Duration? parseRetryAfter(String? value, {required DateTime now}) =>
      throw UnimplementedError();
}
