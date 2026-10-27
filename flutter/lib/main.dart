import 'package:flutter/material.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';

import 'app/app_dependencies_factory.dart';
import 'app/chalkak_app.dart';
import 'core/config/app_config.dart';
import 'core/copy/ko.g.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final AppConfig config;
  try {
    config = AppConfig.fromEnvironment();
  } on AppConfigException catch (e) {
    debugPrint('설정 오류: ${e.reason}');
    runApp(const _ConfigErrorApp());
    return;
  }
  KakaoSdk.init(nativeAppKey: config.kakaoNativeAppKey);
  runApp(ChalkakApp(dependencies: buildAppDependencies(config)));
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
