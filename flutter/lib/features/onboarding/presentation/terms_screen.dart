import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_checkbox.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
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
    final tokens = context.tokens;
    // 시스템 뒤로 가기도 버튼과 같이 컨텍스트를 폐기하고 로그인으로 돌아간다.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) viewModel.onBackPressed();
      },
      child: TestId(
        OnboardingTestIds.termsRoot,
        child: Scaffold(
          // 약관 화면 바탕은 inputBackground다(screens-a §5.1).
          backgroundColor: tokens.colors.inputBackground,
          body: SafeArea(
            child: ListenableBuilder(
              listenable: viewModel,
              builder: (context, _) {
                final state = viewModel.state;
                return Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: tokens.spacing.screenHorizontal,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Transform.translate(
                          offset: const Offset(-12, 0),
                          child: TestId.button(
                            OnboardingTestIds.termsBackButton,
                            child: ChalkakNavButton.back(
                              onPressed: viewModel.onBackPressed,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 2),
                      TestId(
                        OnboardingTestIds.termsTitle,
                        child: Text(
                          Copy.onbTermsTitle,
                          style: tokens.text.title1.copyWith(
                            color: tokens.colors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(height: 57),
                      _AgreementRow(
                        id: OnboardingTestIds.termsAgreeAllCheckbox,
                        label: Copy.onbTermsAgreeAll,
                        checked: state.agreedAll,
                        onToggle: viewModel.toggleAll,
                        all: true,
                      ),
                      const SizedBox(height: 3),
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
                      const Spacer(),
                      TestId.button(
                        OnboardingTestIds.termsNextButton,
                        child: ChalkakButton(
                          label: Copy.onbTermsNext,
                          onPressed: state.canProceed
                              ? viewModel.onNextPressed
                              : null,
                        ),
                      ),
                      const SizedBox(height: 20),
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
/// [all]이면 전체 동의 카드(테두리 1 #E3E1DD, 라운드 large), 아니면 필수 행 + 아래 구분선이다.
class _AgreementRow extends StatelessWidget {
  const _AgreementRow({
    required this.id,
    required this.label,
    required this.checked,
    required this.onToggle,
    this.viewId,
    this.onView,
    this.all = false,
  });

  final String id;
  final String label;
  final bool checked;
  final VoidCallback onToggle;
  final String? viewId;
  final VoidCallback? onView;
  final bool all;

  /// TermsAllConsentRow 테두리 색(OnboardingTermsScreen.swift).
  static const _allBorder = Color(0xFFE3E1DD);

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final toggle = TestId.button(
      id,
      child: Semantics(
        checked: checked,
        onTap: onToggle,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onToggle,
          child: Padding(
            padding: all
                ? const EdgeInsets.symmetric(horizontal: 16, vertical: 19)
                : const EdgeInsets.only(left: 4, top: 16, bottom: 16),
            child: Row(
              children: [
                ChalkakCheckbox(checked: checked),
                SizedBox(width: all ? 16 : 14),
                Expanded(
                  child: Text(
                    label,
                    style: tokens.text.body.copyWith(
                      color: all
                          ? tokens.colors.textPrimary
                          : tokens.colors.textPrimary.withValues(alpha: 0.85),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (all) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: tokens.colors.inputBackground,
          borderRadius: BorderRadius.circular(tokens.radius.large),
          border: Border.all(color: _allBorder),
        ),
        child: toggle,
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: tokens.colors.border)),
      ),
      child: Row(
        children: [
          Expanded(child: toggle),
          if (viewId != null)
            TestId.button(
              viewId!,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onView,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 4, 16),
                  child: Text(
                    Copy.onbTermsView,
                    style: tokens.text.callout.copyWith(
                      color: tokens.colors.textMuted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
