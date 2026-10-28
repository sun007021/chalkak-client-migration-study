import '../network/api_config.dart';
import '../network/api_error.dart';
import 'firebase_config.dart';

/// 빌드 설정(`--dart-define`). 키가 없으면 [AppConfigException]이고 하드코딩 폴백은 없다.
class AppConfig {
  const AppConfig._({
    required this.api,
    required this.kakaoNativeAppKey,
    required this.forceUpdateCheckEnabled,
    this.firebase,
  });

  /// 컴파일 시점 `--dart-define` 값으로 만든다.
  factory AppConfig.fromEnvironment() => AppConfig.parse(
    apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
    kakaoNativeAppKey: const String.fromEnvironment('KAKAO_NATIVE_APP_KEY'),
    forceUpdateCheckEnabled: const bool.fromEnvironment(
      'FORCE_UPDATE_CHECK_ENABLED',
    ),
    firebase: FirebaseConfig.tryParse(
      apiKey: const String.fromEnvironment('FIREBASE_API_KEY'),
      appId: const String.fromEnvironment('FIREBASE_APP_ID'),
      messagingSenderId: const String.fromEnvironment(
        'FIREBASE_MESSAGING_SENDER_ID',
      ),
      projectId: const String.fromEnvironment('FIREBASE_PROJECT_ID'),
      iosBundleId: const String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
    ),
  );

  /// 비었거나 허용되지 않는 값이면 [AppConfigException].
  factory AppConfig.parse({
    required String? apiBaseUrl,
    required String? kakaoNativeAppKey,
    bool forceUpdateCheckEnabled = false,
    FirebaseConfig? firebase,
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
      firebase: firebase,
    );
  }

  final ApiConfig api;
  final String kakaoNativeAppKey;

  /// 강제 업데이트 실제 조회 여부(D-15). 스토어에 올리기 전까지 끈다.
  final bool forceUpdateCheckEnabled;

  /// Firebase 연결 값(`--dart-define`). 없으면 null이며 푸시는 꺼진 채 앱이 뜬다(비밀값은 커밋하지 않는다).
  final FirebaseConfig? firebase;
}

class AppConfigException implements Exception {
  const AppConfigException(this.reason);

  final String reason;

  @override
  String toString() => 'AppConfigException($reason)';
}
