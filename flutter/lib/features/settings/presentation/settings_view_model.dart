import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/session_use_cases.dart';
import '../../auth/domain/user_data_cleaner.dart';
import '../../navigation/domain/guest_guard.dart';
import '../../onboarding/domain/legal_document.dart';
import '../../signature/presentation/signature_card_view_model.dart';
import 'push_settings_view_model.dart';

/// 열려 있는 확인 대화상자.
enum SettingsDialog { logout, withdraw }

class SettingsState {
  const SettingsState({
    required this.isGuest,
    required this.appVersion,
    this.dialog,
    this.accountBusy = false,
  });

  final bool isGuest;

  /// "버전정보" 행의 값. 접두("v") 없이 버전 문자열만(REQ-SET-005, TC-SET-049).
  final String appVersion;

  final SettingsDialog? dialog;

  /// 로그아웃·탈퇴 처리 중. 확인 버튼을 막는다(`settings.withdraw-confirm-button` 처리 중 비활성).
  final bool accountBusy;
}

sealed class SettingsEvent {
  const SettingsEvent();
}

/// 피드백 화면을 연다(회원만).
final class OpenFeedback extends SettingsEvent {
  const OpenFeedback();
}

/// 약관 문서 시트를 연다.
final class OpenLegalDocument extends SettingsEvent {
  const OpenLegalDocument(this.document);

  final LegalDocument document;
}

/// 사인 변경 흐름을 연다. 흐름이 끝나면 호출한 쪽이 [SettingsViewModel.onSignatureChangeFinished]를 부른다.
final class OpenChangeSignature extends SettingsEvent {
  const OpenChangeSignature();
}

/// 설정 탭 전체의 동작(REQ-SET-001~007, REQ-FDBK-001).
///
/// - 게스트: API를 부르지 않는다. 사인·푸시 설정을 불러오지 않는다(REQ-SET-002, TC-SET-008).
///   화면 상태는 `isGuest`로 "로그인" 버튼만 보이게 한다. [onLoginPressed]는 [LeaveGuestUseCase].
/// - [onTabShown]: 탭이 보일 때마다 `screen_view(settings)` 한 번(TC-SET-052, 게스트도 보낸다).
///   회원이면 사인 카드와 푸시 설정을 서로 독립으로 동시에 불러온다. 한쪽 실패가 다른 쪽을 막지 않는다
///   (TC-SET-002, 051).
/// - [onFeedbackPressed]: 게스트면 `GuestRestriction.feedback` 토스트만 보이고 이벤트도 요청도 없다
///   (TC-FDBK-035, REQ-FDBK-001). 회원이면 [OpenFeedback].
/// - [onPrivacyPressed], [onTermsPressed]: [OpenLegalDocument] 이벤트(TC-SET-047). 시트와 screen_view는
///   기존 `LegalDocumentViewModel`이 맡는다.
/// - [onChangeSignaturePressed]: [OpenChangeSignature]. [onSignatureChangeFinished]: 성공이면 사인 카드의
///   `onSignatureChanged`(오래된 조회 폐기 + 재조회), 실패면 아무것도 하지 않는다(TC-SET-009~011).
/// - 로그아웃·탈퇴: 행을 누르면 [SettingsState.dialog]가 열리고 취소하면 닫히며 API 호출이 없다
///   (TC-SET-042, 045). 확인하면 [LogoutUseCase]·[WithdrawUseCase]를 부른다. 탈퇴 실패는 세션 유지 +
///   `Copy.authWithdrawError` 토스트, 취소(cancelled)는 오류 아님. 성공하면 세션이 지워지고 로그인
///   이동은 앱이 한다(REQ-SET-007).
/// - [clearAll]: 푸시 설정과 사인 카드를 비운다(TC-SET-037).
///
/// 자식 ViewModel([signature], [push])은 주입받으며 소유·dispose는 만든 쪽이 한다.
class SettingsViewModel extends ChangeNotifier implements UserDataCleaner {
  SettingsViewModel({
    required this.signature,
    required this.push,
    required this._logout,
    required this._withdraw,
    required this._leaveGuest,
    required this._guestGuard,
    required this._toast,
    required this._analytics,
    required this._isGuest,
    required this._appVersion,
  });

  final SignatureCardViewModel signature;
  final PushSettingsViewModel push;

  final LogoutUseCase _logout;
  final WithdrawUseCase _withdraw;
  final LeaveGuestUseCase _leaveGuest;
  final GuestGuard _guestGuard;
  final ToastSink _toast;
  final AnalyticsTracker _analytics;
  final bool _isGuest;
  final String _appVersion;

  final StreamController<SettingsEvent> _events =
      StreamController<SettingsEvent>.broadcast();

  SettingsDialog? _dialog;
  bool _accountBusy = false;
  bool _disposed = false;
  Future<void>? _tabLoad;

  SettingsState get state => SettingsState(
    isGuest: _isGuest,
    appVersion: _appVersion,
    dialog: _dialog,
    accountBusy: _accountBusy,
  );

  Stream<SettingsEvent> get events => _events.stream;

  Future<void> onTabShown() {
    if (_disposed) return Future<void>.value();
    _analytics.logEvent(AnalyticsEvent.screenView(ScreenNames.settings));
    if (_isGuest) return Future<void>.value();
    // 이전 진입의 조회가 아직 끝나지 않았다면 새로 시작하지 않고 그 결과를 함께 기다린다.
    final running = _tabLoad;
    if (running != null) return running;
    final load = _tabLoad = _loadTab();
    unawaited(
      load.then<void>((_) {}, onError: (Object _) {}).whenComplete(() {
        // 계정이 바뀐 뒤 시작한 새 조회를 지우지 않도록 같은 조회일 때만 비운다.
        if (identical(_tabLoad, load)) _tabLoad = null;
      }),
    );
    return load;
  }

  /// 사인 카드와 푸시 설정은 서로 기다리지 않는다. 한쪽이 실패해도 다른 쪽은 그대로다.
  Future<void> _loadTab() =>
      Future.wait([signature.onSettingsTabShown(), push.onSettingsTabShown()]);

  void onFeedbackPressed() {
    if (_guestGuard.blocks(GuestRestriction.feedback)) return;
    _emit(const OpenFeedback());
  }

  void onPrivacyPressed() =>
      _emit(const OpenLegalDocument(LegalDocument.privacy));

  void onTermsPressed() =>
      _emit(const OpenLegalDocument(LegalDocument.service));

  void onChangeSignaturePressed() => _emit(const OpenChangeSignature());

  Future<void> onSignatureChangeFinished({required bool succeeded}) async {
    if (!succeeded) return;
    await signature.onSignatureChanged();
  }

  void onLogoutRowPressed() => _openDialog(SettingsDialog.logout);

  void onWithdrawRowPressed() => _openDialog(SettingsDialog.withdraw);

  void _openDialog(SettingsDialog dialog) {
    if (_disposed || _isGuest || _accountBusy) return;
    _dialog = dialog;
    notifyListeners();
  }

  /// 열린 확인 대화상자의 "취소". 처리 중에는 닫지 않는다.
  void onDialogCancelled() {
    if (_disposed || _accountBusy || _dialog == null) return;
    _dialog = null;
    notifyListeners();
  }

  Future<void> onLogoutConfirmed() async {
    if (_disposed || _accountBusy || _dialog != SettingsDialog.logout) return;
    _accountBusy = true;
    notifyListeners();
    try {
      // 로컬 정리와 세션 삭제까지가 끝이고, 로그인 화면 이동은 앱이 세션 삭제를 보고 한다.
      await _logout();
    } on Object {
      // 로그아웃 유스케이스는 실패를 삼키도록 만들어져 있다. 예상 밖의 오류도 화면을 멈추지 않는다.
    } finally {
      _finishAccountAction();
    }
  }

  Future<void> onWithdrawConfirmed() async {
    if (_disposed || _accountBusy || _dialog != SettingsDialog.withdraw) return;
    _accountBusy = true;
    notifyListeners();
    var result = WithdrawResult.failed;
    try {
      result = await _withdraw();
    } on Object {
      result = WithdrawResult.failed;
    }
    // 화면이 사라진 뒤의 실패는 알릴 곳이 없다. 성공은 유스케이스가 정리·세션 삭제를 끝냈다.
    if (_disposed) return;
    _finishAccountAction();
    if (result == WithdrawResult.failed) _toast.show(Copy.authWithdrawError);
  }

  void _finishAccountAction() {
    if (_disposed) return;
    _accountBusy = false;
    _dialog = null;
    notifyListeners();
  }

  Future<void> onLoginPressed() async {
    if (_disposed) return;
    try {
      await _leaveGuest();
    } on Object {
      // 저장소 오류. 다시 누를 수 있게 그대로 둔다.
    }
  }

  @override
  Future<void> clearAll() async {
    _tabLoad = null;
    _dialog = null;
    _accountBusy = false;
    await push.clearAll();
    signature.reset();
    if (!_disposed) notifyListeners();
  }

  void _emit(SettingsEvent event) {
    if (_disposed) return;
    _events.add(event);
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_events.close());
    super.dispose();
  }
}
