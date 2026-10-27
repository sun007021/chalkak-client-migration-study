/// 네트워크 공통 상수(D-21). 나중에 core/constants와 합친다.
class NetworkConfig {
  const NetworkConfig._();

  static const String apiPrefix = '/api/v1';
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
  static const Duration presignedPutTimeout = Duration(seconds: 60);

  /// 멱등 요청 재시도 간격. 길이가 곧 최대 재시도 횟수(2회).
  static const List<Duration> retryBackoffs = [
    Duration(milliseconds: 500),
    Duration(seconds: 1),
  ];

  /// Retry-After 상한. 이보다 크면 이 값으로 자른다.
  static const Duration maxRetryAfter = Duration(seconds: 30);
}
