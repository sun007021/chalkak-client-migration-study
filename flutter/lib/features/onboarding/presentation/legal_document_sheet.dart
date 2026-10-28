import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';

import 'legal_document_view_model.dart';
import 'onboarding_test_ids.dart';

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
class LegalDocumentSheet extends StatefulWidget {
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
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      // 웹 문서를 스크롤할 때 시트가 같이 내려가지 않게 한다. 닫기 버튼으로 닫는다.
      enableDrag: false,
      builder: (context) => _DisposingScope(
        viewModel: viewModel,
        child: FractionallySizedBox(
          heightFactor: 0.92,
          child: LegalDocumentSheet(
            viewModel: viewModel,
            webViewBuilder: webViewBuilder,
          ),
        ),
      ),
    );
  }

  @override
  State<LegalDocumentSheet> createState() => _LegalDocumentSheetState();
}

class _LegalDocumentSheetState extends State<LegalDocumentSheet> {
  StreamSubscription<LegalDocumentEvent>? _events;

  @override
  void initState() {
    super.initState();
    _events = widget.viewModel.events.listen(_onEvent);
    widget.viewModel.onShown();
    // 외부 브라우저로 넘기는 경우 시트를 닫아야 하므로 구독 뒤, 첫 프레임 뒤에 시작한다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(widget.viewModel.start());
    });
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  void _onEvent(LegalDocumentEvent event) {
    if (!mounted) return;
    switch (event) {
      case CloseLegalDocument():
        Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      OnboardingTestIds.legalDocSheet,
      child: Material(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: TestId(
                      OnboardingTestIds.legalDocTitle,
                      child: Text(
                        viewModel.document.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ),
                  TestId.button(
                    OnboardingTestIds.legalDocCloseButton,
                    child: IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: Copy.commonClose,
                      onPressed: viewModel.onClosePressed,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListenableBuilder(
                listenable: viewModel,
                builder: (context, _) => _Body(
                  state: viewModel.state,
                  viewModel: viewModel,
                  webViewBuilder: widget.webViewBuilder,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.state,
    required this.viewModel,
    required this.webViewBuilder,
  });

  final LegalDocumentState state;
  final LegalDocumentViewModel viewModel;
  final LegalWebViewBuilder webViewBuilder;

  @override
  Widget build(BuildContext context) {
    final url = state.url;
    if (state.status == LegalDocumentStatus.cannotOpen) {
      return const Center(
        child: TestId(
          OnboardingTestIds.legalDocOpenFailedMessage,
          child: Text(Copy.onbTermsDocCannotOpen),
        ),
      );
    }
    final failed = state.status == LegalDocumentStatus.loadFailed;
    return Stack(
      children: [
        if (url != null)
          Positioned.fill(
            child: TestId(
              OnboardingTestIds.legalDocWebContent,
              child: webViewBuilder(
                context,
                url: url,
                reloadCount: state.reloadCount,
                onLoaded: viewModel.onWebLoaded,
                onError: viewModel.onWebError,
              ),
            ),
          ),
        if (state.status == LegalDocumentStatus.loading)
          const Center(
            child: TestId(
              OnboardingTestIds.legalDocLoading,
              child: CircularProgressIndicator(),
            ),
          ),
        if (failed)
          Positioned.fill(
            child: ColoredBox(
              color: Theme.of(context).colorScheme.surface,
              child: Center(
                child: TestId(
                  OnboardingTestIds.legalDocErrorState,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(Copy.onbTermsDocError),
                      const SizedBox(height: 12),
                      TestId.button(
                        OnboardingTestIds.legalDocRetryButton,
                        child: FilledButton(
                          onPressed: viewModel.retry,
                          child: const Text(Copy.onbTermsDocRetry),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// 시트가 화면에서 완전히 사라질 때 ViewModel을 해제한다(닫힘 애니메이션 중에는 살아 있다).
class _DisposingScope extends StatefulWidget {
  const _DisposingScope({required this.viewModel, required this.child});

  final LegalDocumentViewModel viewModel;
  final Widget child;

  @override
  State<_DisposingScope> createState() => _DisposingScopeState();
}

class _DisposingScopeState extends State<_DisposingScope> {
  @override
  void dispose() {
    widget.viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
