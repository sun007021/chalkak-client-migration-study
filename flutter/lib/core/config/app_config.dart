import '../network/api_config.dart';
import '../network/api_error.dart';

/// 빌드 설정(`--dart-define`). 키가 없으면 [AppConfigException]이고 하드코딩 폴백은 없다.
class AppConfig {
  const AppConfig._({
    required this.api,
    required this.kakaoNativeAppKey,
    required this.forceUpdateCheckEnabled,
  });

  /// 컴파일 시점 `--dart-define` 값으로 만든다.
  factory AppConfig.fromEnvironment() => AppConfig.parse(
    apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
    kakaoNativeAppKey: const String.fromEnvironment('KAKAO_NATIVE_APP_KEY'),
    forceUpdateCheckEnabled: const bool.fromEnvironment(
      'FORCE_UPDATE_CHECK_ENABLED',
    ),
  );

  /// 비었거나 허용되지 않는 값이면 [AppConfigException].
  factory AppConfig.parse({
    required String? apiBaseUrl,
    required String? kakaoNativeAppKey,
    bool forceUpdateCheckEnabled = false,
  }) {
    final ApiConfig api;
    try {
      api = ApiConfig.parse(apiBaseUrl);
    } on ApiError catch (e) {
      throw AppConfigException(e.message ?? 'API_BASE_URL이 올바르지 않다');
    }
    final key = kakaoNativeAppKey?.trim() ?? '';
    if (key.isEmpty) {
      throw const AppConfigException('KAKAO_NATIVE_APP_KEY가 비어 있다');
    }
    return AppConfig._(
      api: api,
      kakaoNativeAppKey: key,
      forceUpdateCheckEnabled: forceUpdateCheckEnabled,
    );
  }

  final ApiConfig api;
  final String kakaoNativeAppKey;

  /// 강제 업데이트 실제 조회 여부(D-15). 스토어에 올리기 전까지 끈다.
  final bool forceUpdateCheckEnabled;
}

class AppConfigException implements Exception {
  const AppConfigException(this.reason);

  final String reason;

  @override
  String toString() => 'AppConfigException($reason)';
}
