import 'package:go_router/go_router.dart';

import 'app_dependencies.dart';

/// splash(`/`), login, main 자리표시자(`home.root`), terms 자리표시자(`terms.root`).
/// - splash는 BootViewModel을 만들어 [BootScreen]을 그리고, Ready면 login 또는 main으로
///   `go`한다(스택 교체). 업데이트 버튼은 `updateGate.openStore()`.
/// - login은 LoginViewModel을 만들어 이벤트를 받아 main(`go`) 또는 terms(`go`, extra=credentials).
/// - 강제 업데이트 중에는 splash 밖으로 나가지 않는다.
GoRouter createAppRouter(AppDependencies dependencies) =>
    throw UnimplementedError();
