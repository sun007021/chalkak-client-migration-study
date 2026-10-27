import '../constants/app_constants.dart';

/// 네트워크 공통 상수(D-21). 값은 shared/constants.json(AppConstants)이 정하고,
/// 여기에는 그 별칭과 constants.json에 없는 값만 둔다.
class NetworkConfig {
  const NetworkConfig._();

  static const String apiPrefix = '/api/v1';
  static const Duration connectTimeout = AppConstants.httpConnectTimeout;
  static const Duration receiveTimeout = AppConstants.httpResponseTimeout;
  static const Duration presignedPutTimeout = AppConstants.uploadPutTimeout;

  /// 멱등 요청 재시도 간격. 길이가 곧 최대 재시도 횟수([AppConstants.retryMax]).
  static const List<Duration> retryBackoffs = AppConstants.retryBackoff;

  /// Retry-After 상한. 이보다 크면 이 값으로 자른다(constants.json에 없음).
  static const Duration maxRetryAfter = Duration(seconds: 30);
}
