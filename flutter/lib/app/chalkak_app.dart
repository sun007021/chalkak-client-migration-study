import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/copy/ko.g.dart';
import 'app_dependencies.dart';
import 'app_router.dart';
import 'app_scope.dart';
import 'session_redirector.dart';

/// 루트 위젯. [AppScope]로 의존성을 내려 주고 go_router를 한 번만 만든다.
/// [SessionRedirector]를 시작해 세션이 지워지면 로그인으로 보낸다.
class ChalkakApp extends StatefulWidget {
  const ChalkakApp({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<ChalkakApp> createState() => _ChalkakAppState();
}

class _ChalkakAppState extends State<ChalkakApp> with WidgetsBindingObserver {
  late final GoRouter _router = createAppRouter(widget.dependencies);
  late final SessionRedirector _redirector = SessionRedirector(
    sessions: widget.dependencies.sessions,
    cleaner: widget.dependencies.userDataCleaner,
    goTo: _router.go,
  );

  @override
  void initState() {
    super.initState();
    _redirector.start();
    WidgetsBinding.instance.addObserver(this);
    // 보류 푸시 복원과 수신 연결. 인증 상태로 시작했다면 기기 등록도 시도한다(BootViewModel도 부르며 중복은 등록기가 걸러낸다).
    unawaited(widget.dependencies.notification.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 포그라운드 복귀: 기기 등록 재시도(세션·토큰이 같으면 등록기가 요청을 보내지 않는다).
    if (state == AppLifecycleState.resumed) {
      widget.dependencies.notification.registerDevice();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(widget.dependencies.notification.dispose());
    _redirector.dispose();
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      dependencies: widget.dependencies,
      child: MaterialApp.router(
        title: Copy.appName,
        routerConfig: _router,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFEE500)),
          useMaterial3: true,
        ),
      ),
    );
  }
}
