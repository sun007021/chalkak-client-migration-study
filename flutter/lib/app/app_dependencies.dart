import '../core/analytics/analytics_tracker.dart';
import '../core/auth/session_manager.dart';
import '../features/auth/domain/login_use_case.dart';
import '../features/auth/domain/push_registrar.dart';
import '../features/auth/domain/session_use_cases.dart';
import '../features/auth/domain/user_data_cleaner.dart';
import '../features/boot/domain/auth_gate.dart';
import '../features/boot/domain/home_preloader.dart';
import '../features/boot/domain/pending_navigation.dart';
import '../features/boot/domain/update_gate.dart';
import '../features/navigation/main_dependencies.dart';
import '../features/notification/notification_dependencies.dart';
import '../features/onboarding/domain/legal_document.dart';
import '../features/onboarding/domain/sign_up_context.dart';
import '../features/onboarding/domain/sign_up_use_case.dart';
import '../features/onboarding/presentation/legal_document_sheet.dart';
import '../features/signature/domain/change_signature_use_case.dart';
import '../features/signature/domain/signature_renderer.dart';
import '../features/signature/domain/signature_repository.dart';

/// 앱이 쓰는 의존성 묶음. 테스트는 Fake로 채운 묶음을 통째로 넣는다.
/// 이후 PR이 필드를 추가하므로 호출 쪽은 이름 있는 인자로만 만든다.
class AppDependencies {
  const AppDependencies({
    required this.sessions,
    required this.analytics,
    required this.updateGate,
    required this.authGate,
    required this.homePreloader,
    required this.pushRegistrar,
    required this.pendingNavigation,
    required this.userDataCleaner,
    required this.loginUseCase,
    required this.enterGuest,
    required this.leaveGuest,
    required this.logout,
    required this.withdraw,
    required this.signUpContext,
    required this.signUpUseCase,
    required this.changeSignatureUseCase,
    required this.signatureRepository,
    required this.signatureRenderer,
    required this.externalLinkLauncher,
    required this.legalWebViewBuilder,
    required this.main,
    required this.notification,
  });

  final SessionManager sessions;
  final AnalyticsTracker analytics;
  final UpdateGate updateGate;
  final AuthGate authGate;
  final HomePreloader homePreloader;
  final PushRegistrar pushRegistrar;
  final PendingNavigation pendingNavigation;
  final UserDataCleaner userDataCleaner;
  final LoginUseCase loginUseCase;
  final EnterGuestUseCase enterGuest;
  final LeaveGuestUseCase leaveGuest;
  final LogoutUseCase logout;
  final WithdrawUseCase withdraw;
  final SignUpContext signUpContext;
  final SignUpUseCase signUpUseCase;
  final ChangeSignatureUseCase changeSignatureUseCase;
  final SignatureRepository signatureRepository;
  final SignatureRenderer signatureRenderer;
  final ExternalLinkLauncher externalLinkLauncher;
  final LegalWebViewBuilder legalWebViewBuilder;
  final MainDependencies main;

  /// 알림함·푸시(탭 처리, 기기 등록, 수신). [pushRegistrar]는 `notification.registrar`다.
  final NotificationDependencies notification;
}
