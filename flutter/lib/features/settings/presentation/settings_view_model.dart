import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
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

  // ignore: unused_field
  final LogoutUseCase _logout;
  // ignore: unused_field
  final WithdrawUseCase _withdraw;
  // ignore: unused_field
  final LeaveGuestUseCase _leaveGuest;
  // ignore: unused_field
  final GuestGuard _guestGuard;
  // ignore: unused_field
  final ToastSink _toast;
  // ignore: unused_field
  final AnalyticsTracker _analytics;
  // ignore: unused_field
  final bool _isGuest;
  // ignore: unused_field
  final String _appVersion;

  SettingsState get state => throw UnimplementedError();

  Stream<SettingsEvent> get events => throw UnimplementedError();

  Future<void> onTabShown() => throw UnimplementedError();

  void onFeedbackPressed() => throw UnimplementedError();

  void onPrivacyPressed() => throw UnimplementedError();

  void onTermsPressed() => throw UnimplementedError();

  void onChangeSignaturePressed() => throw UnimplementedError();

  Future<void> onSignatureChangeFinished({required bool succeeded}) =>
      throw UnimplementedError();

  void onLogoutRowPressed() => throw UnimplementedError();

  void onWithdrawRowPressed() => throw UnimplementedError();

  /// 열린 확인 대화상자의 "취소".
  void onDialogCancelled() => throw UnimplementedError();

  Future<void> onLogoutConfirmed() => throw UnimplementedError();

  Future<void> onWithdrawConfirmed() => throw UnimplementedError();

  Future<void> onLoginPressed() => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
