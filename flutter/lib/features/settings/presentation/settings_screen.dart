import 'package:flutter/material.dart';

import '../../onboarding/domain/legal_document.dart';
import '../../onboarding/presentation/legal_document_sheet.dart';
import '../../onboarding/presentation/legal_document_view_model.dart';
import 'settings_view_model.dart';

/// 설정 탭 화면. testids는 [SettingsTestIds], 상태는 [SettingsViewModel], [PushSettingsViewModel],
/// [SignatureCardViewModel]이 정한다. 이 위젯은 그리기만 한다.
///
/// 회원(`settings.root` 안, 위에서 아래로, REQ-SET-001): 앱 설정(`Copy.settingsSectionApp`) 사인 카드 ->
/// 푸시 알림(`settings.push-section`, `Copy.settingsSectionPush`) 스위치 3개 -> 계정(`settingsSectionAccount`)
/// 로그아웃·회원탈퇴 행 -> 피드백(`settingsSectionFeedback`) 피드백 보내기 행 -> 정보 및 약관
/// (`settingsSectionInfo`) 개인정보처리방침·이용약관·버전정보 행(`settings.version-value`에 버전 문자열).
/// 게스트: `settings.login-button`("로그인") 하나만. 사인·푸시·계정·피드백·약관 행은 트리에 없다(REQ-SET-002).
///
/// 푸시 스위치(`settings.push-topic-toggle` 등): 라벨은 `Copy.settingsPush*`, checked 상태를 노출하고
/// loading/loadFailed에서는 enabled=false, 저장 중인 항목도 다른 항목의 입력을 막지 않는다. loading이면
/// `settings.push-loading`, loadFailed이면 `settings.push-error`(`Copy.settingsPushLoadError`)와
/// `settings.push-retry-button`이 보인다. OS 권한 상태 행은 없다(TC-SET-039).
///
/// 확인 대화상자: `settings.logout-dialog`(`Copy.authLogoutConfirmMessage`)·`settings.withdraw-dialog`
/// (`authWithdrawConfirmMessage`)와 확인(`*-confirm-button`, 문구 `authLogoutConfirmOk`/`authWithdrawConfirmOk`)·
/// 취소(`*-cancel-button`, `Copy.authConfirmCancel`) 버튼. 두 대화상자는 문구와 강조 방식이 다르다(TC-SET-041).
/// 탈퇴 처리 중에는 확인 버튼이 비활성이다.
///
/// 이벤트: [OpenFeedback] -> [onOpenFeedback], [OpenLegalDocument] -> [LegalDocumentSheet.show]
/// ([documentViewModelFactory]로 만든 ViewModel), [OpenChangeSignature] -> [onChangeSignature]를 기다린 뒤
/// 결과로 `onSignatureChangeFinished(succeeded:)`. 사인 조회 실패 토스트는 [onToast]로 넘긴다.
/// 시작 시 `onTabShown`을 한 번 부른다(탭이 다시 보일 때는 호출한 쪽이 `onTabShown`을 부른다).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.viewModel,
    required this.documentViewModelFactory,
    required this.webViewBuilder,
    required this.onOpenFeedback,
    required this.onChangeSignature,
    required this.onToast,
  });

  final SettingsViewModel viewModel;
  final LegalDocumentViewModel Function(LegalDocument document)
  documentViewModelFactory;
  final LegalWebViewBuilder webViewBuilder;

  /// 피드백 화면을 열고 닫힐 때까지 기다린다.
  final Future<void> Function() onOpenFeedback;

  /// 사인 변경 흐름을 열고 변경이 성공했으면 true를 돌려준다.
  final Future<bool> Function() onChangeSignature;

  final void Function(String message) onToast;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
