import '../../core/analytics/analytics_tracker.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../auth/domain/session_use_cases.dart';
import '../navigation/domain/guest_guard.dart';
import '../signature/domain/signature_repository.dart';
import '../signature/presentation/signature_card_view_model.dart';
import 'presentation/push_settings_view_model.dart';
import 'presentation/settings_view_model.dart';
import 'settings_dependencies.dart';

/// 설정 탭이 함께 쓰는 ViewModel 묶음. 메인 화면이 만들고 [dispose]까지 맡는다.
/// 만들어지면 계정 전환·로그아웃 때 지워지도록 `SettingsDataCleaner`에 연결한다.
class SettingsComposition {
  SettingsComposition._(this.viewModel, this._dependencies);

  factory SettingsComposition.create({
    required SettingsDependencies dependencies,
    required SignatureRepository signatureRepository,
    required LogoutUseCase logout,
    required WithdrawUseCase withdraw,
    required LeaveGuestUseCase leaveGuest,
    required ToastSink toast,
    required AnalyticsTracker analytics,
    required bool isGuest,
  }) {
    final viewModel = SettingsViewModel(
      signature: SignatureCardViewModel(
        repository: signatureRepository,
        isGuest: isGuest,
      ),
      push: PushSettingsViewModel(
        repository: dependencies.notificationSettings,
        permission: dependencies.permission,
        toast: toast,
      ),
      logout: logout,
      withdraw: withdraw,
      leaveGuest: leaveGuest,
      guestGuard: GuestGuard(isGuest: isGuest, toast: toast),
      toast: toast,
      analytics: analytics,
      isGuest: isGuest,
      appVersion: dependencies.appVersion,
    );
    dependencies.dataCleaner.attach(viewModel);
    return SettingsComposition._(viewModel, dependencies);
  }

  final SettingsViewModel viewModel;
  final SettingsDependencies _dependencies;

  /// 진행 중인 요청을 취소하고 낙관적으로 바꾼 값을 조용히 되돌린 뒤 정리한다.
  void dispose() {
    _dependencies.dataCleaner.detach(viewModel);
    viewModel.push.dispose();
    viewModel.signature.dispose();
    viewModel.dispose();
  }
}
