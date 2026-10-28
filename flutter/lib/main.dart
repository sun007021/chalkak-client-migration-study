import 'package:flutter/material.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'app/app_dependencies_factory.dart';
import 'app/chalkak_app.dart';
import 'core/config/app_config.dart';
import 'core/copy/ko.g.dart';
import 'features/notification/data/push_platform.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final AppConfig config;
  try {
    config = AppConfig.fromEnvironment();
  } on AppConfigException catch (e) {
    debugPrint('설정 오류: ${e.reason}');
    runApp(const _ConfigErrorApp());
    return;
  }
  await KakaoSdk.init(nativeAppKey: config.kakaoNativeAppKey);
  // 앱을 먼저 띄우고 Firebase는 뒤에서 초기화한다(짧은 시간 제한). 설정이 없거나 실패하면
  // 푸시가 꺼진 채로 동작한다(로그 한 번).
  final push = PushPlatform.deferred(
    PushPlatform.initialize(config: config.firebase),
  );
  runApp(
    ChalkakApp(
      dependencies: buildAppDependencies(
        config,
        push: push,
        appVersion: await _appVersion(),
      ),
    ),
  );
}

/// 설치된 앱의 버전 문자열(pubspec `version`의 빌드 이름: iOS `MARKETING_VERSION`, Android `versionName`).
/// 읽지 못하면 빈 문자열이고 설정의 버전정보 값만 비어 보인다.
Future<String> _appVersion() async {
  try {
    return (await PackageInfo.fromPlatform()).version;
  } on Object catch (error) {
    debugPrint('앱 버전을 읽지 못했다(${error.runtimeType})');
    return '';
  }
}

/// `--dart-define`이 빠졌을 때 보이는 화면. 원인은 로그에 남는다.
class _ConfigErrorApp extends StatelessWidget {
  const _ConfigErrorApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: Copy.appName,
      home: Scaffold(body: Center(child: Text(Copy.commonErrorConfig))),
    );
  }
}
