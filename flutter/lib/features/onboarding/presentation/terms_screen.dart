import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';

import '../domain/legal_document.dart';
import 'legal_document_sheet.dart';
import 'legal_document_view_model.dart';
import 'onboarding_test_ids.dart';
import 'terms_view_model.dart';

/// 약관 동의 화면. testids: `terms.root`, `terms.title`(`onb.terms.title`),
/// `terms.agree-all-checkbox`·`terms.service-checkbox`·`terms.privacy-checkbox`(checked 노출),
/// `terms.service-view-button`·`terms.privacy-view-button`("보기"), `terms.next-button`
/// (두 필수 동의 전 enabled=false), `terms.back-button`.
/// "보기"는 [LegalDocumentSheet.show]로 시트를 연다(시트를 닫아도 체크 상태 유지).
/// 시작 시 [TermsViewModel.onShown]을 부르고, 시트 외의 이벤트(다음·뒤로)는 [onEvent]로 넘긴다.
class TermsScreen extends StatefulWidget {
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
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  StreamSubscription<TermsEvent>? _events;

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void didUpdateWidget(TermsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewModel != widget.viewModel) {
      _events?.cancel();
      _attach();
    }
  }

  void _attach() {
    _events = widget.viewModel.events.listen(_onEvent);
    widget.viewModel.onShown();
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  void _onEvent(TermsEvent event) {
    if (!mounted) return;
    switch (event) {
      case OpenLegalDocument(:final document):
        unawaited(
          LegalDocumentSheet.show(
            context,
            viewModel: widget.documentViewModelFactory(document),
            webViewBuilder: widget.webViewBuilder,
          ),
        );
      case NavigateToSignature() || ReturnToLogin():
        widget.onEvent(event);
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    // 시스템 뒤로 가기도 버튼과 같이 컨텍스트를 폐기하고 로그인으로 돌아간다.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) viewModel.onBackPressed();
      },
      child: TestId(
        OnboardingTestIds.termsRoot,
        child: Scaffold(
          body: SafeArea(
            child: ListenableBuilder(
              listenable: viewModel,
              builder: (context, _) {
                final state = viewModel.state;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TestId.button(
                          OnboardingTestIds.termsBackButton,
                          child: IconButton(
                            icon: const Icon(Icons.arrow_back),
                            onPressed: viewModel.onBackPressed,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TestId(
                        OnboardingTestIds.termsTitle,
                        child: Text(
                          Copy.onbTermsTitle,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                      ),
                      const Spacer(),
                      _AgreementRow(
                        id: OnboardingTestIds.termsAgreeAllCheckbox,
                        label: Copy.onbTermsAgreeAll,
                        checked: state.agreedAll,
                        onToggle: viewModel.toggleAll,
                        bold: true,
                      ),
                      const Divider(),
                      _AgreementRow(
                        id: OnboardingTestIds.termsServiceCheckbox,
                        label: Copy.onbTermsService,
                        checked: state.agreedService,
                        onToggle: viewModel.toggleService,
                        viewId: OnboardingTestIds.termsServiceViewButton,
                        onView: () =>
                            viewModel.openDocument(LegalDocument.service),
                      ),
                      _AgreementRow(
                        id: OnboardingTestIds.termsPrivacyCheckbox,
                        label: Copy.onbTermsPrivacy,
                        checked: state.agreedPrivacy,
                        onToggle: viewModel.togglePrivacy,
                        viewId: OnboardingTestIds.termsPrivacyViewButton,
                        onView: () =>
                            viewModel.openDocument(LegalDocument.privacy),
                      ),
                      const SizedBox(height: 24),
                      TestId.button(
                        OnboardingTestIds.termsNextButton,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                          ),
                          onPressed: state.canProceed
                              ? viewModel.onNextPressed
                              : null,
                          child: const Text(Copy.onbTermsNext),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// 체크 한 줄. 줄 전체가 체크 영역이고, [viewId]가 있으면 오른쪽에 "보기"가 붙는다.
class _AgreementRow extends StatelessWidget {
  const _AgreementRow({
    required this.id,
    required this.label,
    required this.checked,
    required this.onToggle,
    this.viewId,
    this.onView,
    this.bold = false,
  });

  final String id;
  final String label;
  final bool checked;
  final VoidCallback onToggle;
  final String? viewId;
  final VoidCallback? onView;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TestId.button(
            id,
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Checkbox(value: checked, onChanged: (_) => onToggle()),
                    Expanded(
                      child: Text(
                        label,
                        style: bold
                            ? Theme.of(context).textTheme.titleMedium
                            : null,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (viewId != null)
          TestId.button(
            viewId!,
            child: TextButton(
              onPressed: onView,
              child: const Text(Copy.onbTermsView),
            ),
          ),
      ],
    );
  }
}
