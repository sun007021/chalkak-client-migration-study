import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/copy/ko.g.dart';
import '../core/ui/test_id.dart';
import '../core/ui/test_ids.dart';
import '../features/auth/domain/signup_credentials.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/login_view_model.dart';
import '../features/boot/domain/boot_view_model.dart';
import '../features/boot/domain/update_gate.dart';
import '../features/boot/presentation/boot_screen.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';

/// splash(`/`), login, main 자리표시자(`home.root`), terms 자리표시자(`terms.root`).
/// - splash는 BootViewModel을 만들어 [BootScreen]을 그리고, Ready면 login 또는 main으로
///   `go`한다(스택 교체). 업데이트 버튼은 `updateGate.openStore()`.
/// - login은 LoginViewModel을 만들어 이벤트를 받아 main(`go`) 또는 terms(`go`, extra=credentials).
/// - 강제 업데이트 중에는 splash 밖으로 나가지 않는다.
GoRouter createAppRouter(AppDependencies dependencies) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: dependencies.updateGate,
    redirect: (context, state) {
      final forced = dependencies.updateGate.status == UpdateGateStatus.forced;
      if (forced && state.matchedLocation != AppRoutes.splash) {
        return AppRoutes.splash;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => _ViewModelHost<BootViewModel>(
          create: () {
            final viewModel = BootViewModel(
              updateGate: dependencies.updateGate,
              authGate: dependencies.authGate,
              homePreloader: dependencies.homePreloader,
              pushRegistrar: dependencies.pushRegistrar,
            );
            // 게이트가 라우터를 갱신시키므로 빌드 도중이 아닌 다음 마이크로태스크에 시작한다.
            Future.microtask(viewModel.start);
            return viewModel;
          },
          builder: (context, viewModel) => BootScreen(
            viewModel: viewModel,
            onReady: (ready) => context.go(
              ready.destination == BootDestination.login
                  ? AppRoutes.login
                  : AppRoutes.main,
            ),
            onUpdatePressed: dependencies.updateGate.openStore,
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => _ViewModelHost<LoginViewModel>(
          create: () {
            return LoginViewModel(
              loginUseCase: dependencies.loginUseCase,
              enterGuest: dependencies.enterGuest,
            );
          },
          builder: (context, viewModel) => LoginScreen(
            viewModel: viewModel,
            onEvent: (event) => switch (event) {
              NavigateToMain() => context.go(AppRoutes.main),
              NavigateToTerms(:final credentials) => context.go(
                AppRoutes.terms,
                extra: credentials,
              ),
            },
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.main,
        builder: (context, state) =>
            const _PlaceholderScreen(id: TestIds.homeRoot),
      ),
      GoRoute(
        path: AppRoutes.terms,
        builder: (context, state) {
          // 가입 흐름 PR이 받을 값. 이 PR에서는 화면에 쓰지 않는다.
          assert(state.extra is SignUpCredentials?);
          return const _PlaceholderScreen(id: TestIds.termsRoot);
        },
      ),
    ],
  );
}

/// 라우트가 ViewModel의 생성과 해제를 맡는다(화면이 사라지면 dispose).
class _ViewModelHost<T extends ChangeNotifier> extends StatefulWidget {
  const _ViewModelHost({required this.create, required this.builder});

  final T Function() create;
  final Widget Function(BuildContext context, T viewModel) builder;

  @override
  State<_ViewModelHost<T>> createState() => _ViewModelHostState<T>();
}

class _ViewModelHostState<T extends ChangeNotifier>
    extends State<_ViewModelHost<T>> {
  late final T _viewModel = widget.create();

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _viewModel);
}

/// 홈·약관 PR이 실제 화면으로 바꾸기 전까지 쓰는 빈 화면.
class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return TestId(
      id,
      child: const Scaffold(body: Center(child: Text(Copy.appName))),
    );
  }
}
