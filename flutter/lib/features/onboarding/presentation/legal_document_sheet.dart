import 'package:flutter/material.dart';

import 'legal_document_view_model.dart';

/// 앱 안 웹뷰를 그리는 위젯 팩토리. 실제 앱은 webview_flutter 등으로 구현하고, 테스트는
/// 로드 성공·실패를 흉내 내는 가짜 위젯을 넣는다. [reloadCount]가 바뀌면 다시 불러온다.
typedef LegalWebViewBuilder = Widget Function(
  BuildContext context, {
  required Uri url,
  required int reloadCount,
  required VoidCallback onLoaded,
  required VoidCallback onError,
});

/// 약관 문서 시트(가입·설정 공용). testids: `legal-doc.sheet`, `legal-doc.title`
/// (문서 제목), `legal-doc.close-button`, `legal-doc.web-content`(웹뷰, inApp일 때),
/// `legal-doc.loading`(loading일 때만), `legal-doc.error-state`(loadFailed일 때만,
/// `onb.terms.doc.error`)와 `legal-doc.retry-button`, `legal-doc.open-failed-message`
/// (cannotOpen일 때만, `onb.terms.doc.cannot-open`).
class LegalDocumentSheet extends StatelessWidget {
  const LegalDocumentSheet({
    super.key,
    required this.viewModel,
    required this.webViewBuilder,
  });

  final LegalDocumentViewModel viewModel;
  final LegalWebViewBuilder webViewBuilder;

  /// 모달 시트로 연다. 시트가 닫히면 viewModel을 dispose한다.
  static Future<void> show(
    BuildContext context, {
    required LegalDocumentViewModel viewModel,
    required LegalWebViewBuilder webViewBuilder,
  }) => throw UnimplementedError();

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
