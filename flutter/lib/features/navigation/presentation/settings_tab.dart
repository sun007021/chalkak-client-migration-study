import '../../onboarding/domain/legal_document.dart';
import '../../onboarding/presentation/legal_document_sheet.dart';
import '../../onboarding/presentation/legal_document_view_model.dart';
import '../../settings/presentation/settings_view_model.dart';

/// 메인 셸이 설정 탭을 그리는 데 필요한 것. 소유와 정리는 만든 쪽이 한다.
class SettingsTab {
  const SettingsTab({
    required this.viewModel,
    required this.documentViewModelFactory,
    required this.webViewBuilder,
    required this.onOpenFeedback,
    required this.onChangeSignature,
  });

  final SettingsViewModel viewModel;
  final LegalDocumentViewModel Function(LegalDocument document)
  documentViewModelFactory;
  final LegalWebViewBuilder webViewBuilder;

  /// 피드백 화면을 열고 닫힐 때까지 기다린다.
  final Future<void> Function() onOpenFeedback;

  /// 사인 변경 흐름을 열고 변경이 성공했으면 true를 돌려준다.
  final Future<bool> Function() onChangeSignature;
}
