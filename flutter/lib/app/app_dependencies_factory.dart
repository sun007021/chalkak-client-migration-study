import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/analytics/analytics_tracker.dart';
import '../core/auth/session_manager.dart';
import '../core/auth/token_store.dart';
import '../core/config/app_config.dart';
import '../core/network/api_client.dart';
import '../features/auth/data/api_auth_repository.dart';
import '../features/auth/data/default_kakao_sdk_gateway.dart';
import '../features/auth/data/kakao_social_login_client.dart';
import '../features/auth/domain/login_use_case.dart';
import '../features/auth/domain/nonce.dart';
import '../features/auth/domain/push_registrar.dart';
import '../features/auth/domain/session_use_cases.dart';
import '../features/auth/domain/user_data_cleaner.dart';
import '../features/boot/data/disabled_update_check.dart';
import '../features/boot/domain/auth_gate.dart';
import '../features/boot/domain/home_preloader.dart';
import '../features/boot/domain/pending_navigation.dart';
import '../features/boot/domain/update_gate.dart';
import 'app_dependencies.dart';

/// 실제 구현으로 [AppDependencies]를 조립한다. 아직 구현이 없는 기능(홈, 푸시)은
/// 자리표시자를 끼우고 해당 PR이 교체한다.
AppDependencies buildAppDependencies(AppConfig config) {
  final sessions = SessionManager(
    store: SecureTokenStore(
      storage: FlutterSecureKeyValueStore(const FlutterSecureStorage()),
    ),
  );
  final client = ApiClient(config: config.api, sessions: sessions);
  final repository = ApiAuthRepository(client: client);

  final updateGate = UpdateGate(
    checker: const DisabledUpdateChecker(),
    launcher: const DisabledUpdateLauncher(),
    enabled: config.forceUpdateCheckEnabled,
  );
  // 푸시 탭 이동 연결은 PUSH PR에서 라우터와 이어 준다.
  final pendingNavigation = PendingNavigation(
    gate: updateGate,
    navigate: (_) {},
  );
  final cleaner = CompositeUserDataCleaner([pendingNavigation]);
  const pushRegistrar = _NoopPushRegistrar();

  return AppDependencies(
    sessions: sessions,
    analytics: LogAnalyticsTracker(),
    updateGate: updateGate,
    authGate: AuthGate(sessions: sessions),
    homePreloader: const _NoopHomePreloader(),
    pushRegistrar: pushRegistrar,
    pendingNavigation: pendingNavigation,
    userDataCleaner: cleaner,
    loginUseCase: LoginUseCase(
      socialLogin: KakaoSocialLoginClient(sdk: DefaultKakaoSdkGateway()),
      nonceGenerator: SecureNonceGenerator(random: Random.secure()),
      repository: repository,
      sessions: sessions,
      cleaner: cleaner,
      pushRegistrar: pushRegistrar,
    ),
    enterGuest: EnterGuestUseCase(sessions: sessions),
    leaveGuest: LeaveGuestUseCase(sessions: sessions),
    logout: LogoutUseCase(
      sessions: sessions,
      repository: repository,
      cleaner: cleaner,
    ),
    withdraw: WithdrawUseCase(
      sessions: sessions,
      repository: repository,
      cleaner: cleaner,
    ),
  );
}

class _NoopHomePreloader implements HomePreloader {
  const _NoopHomePreloader();

  @override
  Future<void> preload({required bool guest}) async {}
}

class _NoopPushRegistrar implements PushRegistrar {
  const _NoopPushRegistrar();

  @override
  Future<void> registerCurrentDevice() async {}
}
