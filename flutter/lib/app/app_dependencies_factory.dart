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
import '../features/auth/domain/session_use_cases.dart';
import '../features/auth/domain/user_data_cleaner.dart';
import '../features/boot/data/disabled_update_check.dart';
import '../features/boot/domain/auth_gate.dart';
import '../features/boot/domain/update_gate.dart';
import '../features/home/domain/home_preload.dart';
import '../features/like/domain/like_data_cleaner.dart';
import '../features/navigation/main_dependencies_factory.dart';
import '../features/notification/data/api_notification_repository.dart';
import '../features/notification/data/api_push_device_repository.dart';
import '../features/notification/data/api_session_refresher.dart';
import '../features/notification/data/push_platform.dart';
import '../features/notification/data/shared_preferences_push_stores.dart';
import '../features/notification/notification_dependencies.dart';
import '../features/onboarding/data/api_sign_up_repository.dart';
import '../features/onboarding/data/url_launcher_external_link_launcher.dart';
import '../features/onboarding/domain/sign_up_context.dart';
import '../features/onboarding/domain/sign_up_use_case.dart';
import '../features/onboarding/presentation/legal_web_view.dart';
import '../features/settings/settings_dependencies_factory.dart';
import '../features/signature/data/api_signature_repository.dart';
import '../features/signature/data/api_signature_uploader.dart';
import '../features/signature/data/ui_signature_renderer.dart';
import '../features/signature/domain/change_signature_use_case.dart';
import 'app_dependencies.dart';

/// 실제 구현으로 [AppDependencies]를 조립한다. 아직 구현이 없는 기능(홈, 푸시)은
/// 자리표시자를 끼우고 해당 PR이 교체한다.
AppDependencies buildAppDependencies(
  AppConfig config, {
  PushPlatform push = const PushPlatform.disabled(),
  String appVersion = '',
}) {
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
  final main = buildMainDependencies(client);
  final notification = buildNotificationDependencies(
    repository: ApiNotificationRepository(client: client),
    devices: ApiPushDeviceRepository(client: client),
    sessions: sessions,
    refresher: ApiSessionRefresher(client: client),
    platform: push,
    pendingStore: SharedPreferencesPendingPushStore(),
    promptFlag: SharedPreferencesPermissionPromptFlag(),
    toast: main.toast,
  );
  final settings = buildSettingsDependencies(
    client: client,
    permission: push.permission,
    appVersion: appVersion,
  );
  final cleaner = CompositeUserDataCleaner([
    notification.registrar,
    notification.coordinator,
    notification.tapRunner,
    main.preloadCache,
    LikeDataCleaner(likes: main.likeStore, postEvents: main.postEvents),
    main.recordCleaner,
    main.homeAiReview,
    settings.dataCleaner,
  ]);
  final pushRegistrar = notification.registrar;
  final signatureRepository = ApiSignatureRepository(client: client);
  final signatureUploader = ApiSignatureUploader(client: client);

  return AppDependencies(
    sessions: sessions,
    analytics: LogAnalyticsTracker(),
    updateGate: updateGate,
    authGate: AuthGate(sessions: sessions),
    homePreloader: ApiHomePreloader(
      home: main.homeRepository,
      today: main.todayPostRepository,
      banners: main.bannerRepository,
      cache: main.preloadCache,
    ),
    pushRegistrar: pushRegistrar,
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
    signUpContext: SignUpContext(),
    signUpUseCase: SignUpUseCase(
      repository: ApiSignUpRepository(client: client),
      uploader: signatureUploader,
      authRepository: repository,
      sessions: sessions,
      pushRegistrar: pushRegistrar,
    ),
    changeSignatureUseCase: ChangeSignatureUseCase(
      repository: signatureRepository,
      uploader: signatureUploader,
      sessions: sessions,
    ),
    signatureRepository: signatureRepository,
    signatureRenderer: const UiSignatureRenderer(),
    externalLinkLauncher: const UrlLauncherExternalLinkLauncher(),
    legalWebViewBuilder: LegalWebView.build,
    main: main,
    notification: notification,
    settings: settings,
  );
}
