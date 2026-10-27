import 'package:flutter/material.dart';

import 'app_dependencies.dart';

/// 루트 위젯. [AppScope]로 의존성을 내려 주고 go_router를 한 번만 만든다.
/// [SessionRedirector]를 시작해 세션이 지워지면 로그인으로 보낸다.
class ChalkakApp extends StatefulWidget {
  const ChalkakApp({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<ChalkakApp> createState() => _ChalkakAppState();
}

class _ChalkakAppState extends State<ChalkakApp> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
