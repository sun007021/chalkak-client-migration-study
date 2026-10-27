import 'package:flutter/widgets.dart';

import 'app_dependencies.dart';

/// 화면이 [AppDependencies]를 꺼내 쓰는 창구.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.dependencies, required super.child});

  final AppDependencies dependencies;

  /// 조상에 [AppScope]가 없으면 FlutterError.
  static AppDependencies of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    if (scope == null) {
      throw FlutterError('AppScope가 위젯 트리 위에 없다. ChalkakApp 아래에서 사용해야 한다.');
    }
    return scope.dependencies;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      dependencies != oldWidget.dependencies;
}
