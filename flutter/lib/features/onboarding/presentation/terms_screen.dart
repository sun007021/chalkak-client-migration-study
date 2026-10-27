import 'package:flutter/material.dart';

import '../domain/legal_document.dart';
import 'legal_document_sheet.dart';
import 'legal_document_view_model.dart';
import 'terms_view_model.dart';

/// 약관 동의 화면. testids: `terms.root`, `terms.title`(`onb.terms.title`),
/// `terms.agree-all-checkbox`·`terms.service-checkbox`·`terms.privacy-checkbox`(checked 노출),
/// `terms.service-view-button`·`terms.privacy-view-button`("보기"), `terms.next-button`
/// (두 필수 동의 전 enabled=false), `terms.back-button`.
/// "보기"는 [LegalDocumentSheet.show]로 시트를 연다(시트를 닫아도 체크 상태 유지).
/// 시작 시 [TermsViewModel.onShown]을 부르고, 시트 외의 이벤트(다음·뒤로)는 [onEvent]로 넘긴다.
class TermsScreen extends StatelessWidget {
  const TermsScreen({
    super.key,
    required this.viewModel,
    required this.documentViewModelFactory,
    required this.webViewBuilder,
    required this.onEvent,
  });

  final TermsViewModel viewModel;
  final LegalDocumentViewModel Function(LegalDocument document)
  documentViewModelFactory;
  final LegalWebViewBuilder webViewBuilder;
  final void Function(TermsEvent event) onEvent;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
