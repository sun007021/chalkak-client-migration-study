import 'package:flutter/material.dart';

import 'app/app_dependencies.dart';
import 'app/chalkak_app.dart';

/// 실제 의존성 조립은 구현 PR에서 채운다.
AppDependencies buildAppDependencies() => throw UnimplementedError();

void main() {
  runApp(ChalkakApp(dependencies: buildAppDependencies()));
}
