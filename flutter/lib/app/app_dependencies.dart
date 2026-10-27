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
}
