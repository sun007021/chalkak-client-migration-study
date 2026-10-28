import 'package:chalkak/app/app_dependencies.dart';
import 'package:chalkak/app/chalkak_app.dart';
import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/domain/login_use_case.dart';
import 'package:chalkak/features/auth/domain/session_use_cases.dart';
import 'package:chalkak/features/auth/domain/user_data_cleaner.dart';
import 'package:chalkak/features/boot/domain/auth_gate.dart';
import 'package:chalkak/features/boot/domain/update_gate.dart';
import 'package:chalkak/features/notification/data/push_platform.dart';
import 'package:chalkak/features/notification/notification_dependencies.dart';
import 'package:chalkak/features/onboarding/data/api_sign_up_repository.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_context.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_use_case.dart';
import 'package:chalkak/features/signature/data/api_signature_repository.dart';
import 'package:chalkak/features/signature/data/api_signature_uploader.dart';
import 'package:chalkak/features/signature/domain/change_signature_use_case.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_fakes.dart';
import 'fake_analytics_tracker.dart';
import 'home_fakes.dart';
import 'notification_fakes.dart';
import 'onboarding_fakes.dart';

export 'ui_helpers.dart';

/// Fake로 채운 [AppDependencies]와 그 Fake들에 접근하는 창구. 위젯 테스트용.
class AppHarness {
  AppHarness({Session? session, bool updateGateEnabled = true})
    : http = AuthHttpHarness(session: session) {
    updateGate = UpdateGate(
      checker: updateChecker,
      launcher: launcher,
      enabled: updateGateEnabled,
    );
    final repository = ApiAuthRepository(client: http.client);
    final cleaner = CompositeUserDataCleaner([userData]);
    final signatureRepository = ApiSignatureRepository(client: http.client);
    final signatureUploader = ApiSignatureUploader(client: http.client);
    dependencies = AppDependencies(
      sessions: http.sessions,
      analytics: analytics,
      updateGate: updateGate,
      authGate: AuthGate(sessions: http.sessions),
      homePreloader: preloader,
      pushRegistrar: push,
      userDataCleaner: cleaner,
      loginUseCase: LoginUseCase(
        socialLogin: kakao,
        nonceGenerator: FakeNonceGenerator(),
        repository: repository,
        sessions: http.sessions,
        cleaner: cleaner,
        pushRegistrar: push,
      ),
      enterGuest: EnterGuestUseCase(sessions: http.sessions),
      leaveGuest: LeaveGuestUseCase(sessions: http.sessions),
      logout: LogoutUseCase(
        sessions: http.sessions,
        repository: repository,
        cleaner: cleaner,
      ),
      withdraw: WithdrawUseCase(
        sessions: http.sessions,
        repository: repository,
        cleaner: cleaner,
      ),
      signUpContext: signUpContext,
      signUpUseCase: SignUpUseCase(
        repository: ApiSignUpRepository(client: http.client),
        uploader: signatureUploader,
        authRepository: repository,
        sessions: http.sessions,
        pushRegistrar: push,
      ),
      changeSignatureUseCase: ChangeSignatureUseCase(
        repository: signatureRepository,
        uploader: signatureUploader,
        sessions: http.sessions,
      ),
      signatureRepository: signatureRepository,
      signatureRenderer: renderer,
      externalLinkLauncher: externalLinks,
      legalWebViewBuilder: fakeLegalWebView,
      main: homeFakes.dependencies,
      notification: buildNotificationDependencies(
        repository: notificationRepository,
        devices: pushDevices,
        sessions: http.sessions,
        refresher: FakeSessionRefresher(),
        platform: const PushPlatform.disabled(),
        pendingStore: FakePendingPushStore(),
        promptFlag: FakePermissionFlag(),
        toast: homeFakes.dependencies.toast,
      ),
    );
  }

  late final HomeFakes homeFakes = HomeFakes(http);
  final AuthHttpHarness http;
  final FakeUpdateChecker updateChecker = FakeUpdateChecker();
  final FakeUpdateLauncher launcher = FakeUpdateLauncher();
  final FakeHomePreloader preloader = FakeHomePreloader();
  final FakePushRegistrar push = FakePushRegistrar();
  final FakeNotificationRepository notificationRepository =
      FakeNotificationRepository();
  final FakePushDeviceRepository pushDevices = FakePushDeviceRepository();
  final FakeUserDataCleaner userData = FakeUserDataCleaner();
  final FakeSocialLoginClient kakao = FakeSocialLoginClient();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final SignUpContext signUpContext = SignUpContext();
  final FakeSignatureRenderer renderer = FakeSignatureRenderer();
  final FakeExternalLinkLauncher externalLinks = FakeExternalLinkLauncher();
  late final UpdateGate updateGate;
  late final AppDependencies dependencies;

  Widget get app => ChalkakApp(dependencies: dependencies);
}

/// 앱을 띄우고 [frames]프레임(16ms)을 흘린다. 진행 표시가 계속 도는 화면이 있어
/// pumpAndSettle은 쓰지 않는다.
Future<void> pumpApp(
  WidgetTester tester,
  AppHarness h, {
  int frames = 10,
}) async {
  await tester.pumpWidget(h.app);
  await settleUi(tester, frames: frames);
}
