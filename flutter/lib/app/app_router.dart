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
import 'sign_up_routes.dart';
import 'view_model_host.dart';

/// splash(`/`), login, main 자리표시자(`home.root`), 가입 흐름(`sign_up_routes.dart`).
/// - splash는 BootViewModel을 만들어 [BootScreen]을 그리고, Ready면 login 또는 main으로
///   `go`한다(스택 교체). 업데이트 버튼은 `updateGate.openStore()`.
/// - login은 LoginViewModel을 만들어 이벤트를 받아 main(`go`) 또는 가입 흐름(`SignUpContext.begin` 후
///   terms로 `go`). extra가 문자열이면 가입에서 돌아오며 넘긴 안내 문구로 보여 준다.
/// - 가입 흐름 화면(`/terms/**`)은 `SignUpContext`가 비어 있으면 login으로 보낸다.
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
      return signUpRedirect(dependencies, state);
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => ViewModelHost<BootViewModel>(
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
        builder: (context, state) => ViewModelHost<LoginViewModel>(
          create: () {
            final viewModel = LoginViewModel(
              loginUseCase: dependencies.loginUseCase,
              enterGuest: dependencies.enterGuest,
            );
            final notice = state.extra;
            if (notice is String) viewModel.showNotice(notice);
            return viewModel;
          },
          builder: (context, viewModel) => LoginScreen(
            viewModel: viewModel,
            onEvent: (event) => switch (event) {
              NavigateToMain() => context.go(AppRoutes.main),
              NavigateToTerms(:final credentials) => _startSignUp(
                context,
                dependencies,
                credentials,
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
      buildSignUpRoute(dependencies),
    ],
  );
}

/// 홈 PR이 실제 화면으로 바꾸기 전까지 쓰는 빈 화면.
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

/// 가입에 쓸 idToken·rawNonce를 메모리 컨텍스트에 두고 약관으로 간다.
void _startSignUp(
  BuildContext context,
  AppDependencies dependencies,
  SignUpCredentials credentials,
) {
  dependencies.signUpContext.begin(credentials);
  context.go(AppRoutes.terms);
}
