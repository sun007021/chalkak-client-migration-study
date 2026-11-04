import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_dialog.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
import '../../../core/ui/test_id.dart';
import '../domain/ai_review_session.dart';
import '../domain/ai_review_state.dart';
import 'ai_review_test_ids.dart';

/// 하단 시트 한 장의 내용. 세션의 [AiReviewState.sheet]에 따라 시작·결과·실패 시트를 그린다.
/// 시트를 닫는 동작은 모두 세션에 맡기고(`onSheetDismissed`), 실제 닫기는 호스트가 한다.
class AiReviewSheetContent extends StatefulWidget {
  const AiReviewSheetContent({super.key, required this.session});

  final AiReviewSession session;

  @override
  State<AiReviewSheetContent> createState() => _AiReviewSheetContentState();
}

class _AiReviewSheetContentState extends State<AiReviewSheetContent> {
  /// 시트가 닫히는 동안(상태는 이미 null)에도 마지막 내용을 그려 높이가 줄지 않게 한다.
  AiSheet? _last;

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final current = session.state.sheet;
        if (current != null) _last = current;
        return switch (current ?? _last) {
          AiStartSheet(:final retry) => _StartSheet(
            retry: retry,
            onStart: session.onStartConfirmed,
            onClose: session.onSheetDismissed,
          ),
          AiResultSheet(:final content) => _ResultSheet(
            content: content,
            onCriteriaHelp: session.onCriteriaHelpPressed,
            onClose: session.onSheetDismissed,
          ),
          AiFailedSheet(:final reason) => _FailedSheet(
            reason: reason,
            onConfirm: session.onSheetDismissed,
          ),
          null => const SizedBox.shrink(),
        };
      },
    );
  }
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.id, required this.children});

  final String id;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return TestId(
      id,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.id, required this.onPressed});

  final String id;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return TestId.button(
      id,
      child: ChalkakNavButton.close(onPressed: onPressed),
    );
  }
}

class _StartSheet extends StatelessWidget {
  const _StartSheet({
    required this.retry,
    required this.onStart,
    required this.onClose,
  });

  final bool retry;
  final VoidCallback onStart;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return _SheetFrame(
      id: AiReviewTestIds.startSheetRoot,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                retry ? Copy.aiStartTitleRetry : Copy.aiStartTitle,
                style: tokens.text.title3.copyWith(
                  color: tokens.colors.textPrimary,
                ),
              ),
            ),
            _CloseButton(
              id: AiReviewTestIds.startSheetCloseButton,
              onPressed: onClose,
            ),
          ],
        ),
        const SizedBox(height: 12),
        TestId(
          AiReviewTestIds.startSheetDescription,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final line in const [
                Copy.aiStartLine1,
                Copy.aiStartLine2,
                Copy.aiStartLine3,
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    line,
                    style: tokens.text.subheadline.copyWith(
                      color: tokens.colors.textSecondary,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TestId.button(
          AiReviewTestIds.startSheetStartButton,
          child: ChalkakButton(onPressed: onStart, label: Copy.aiStartConfirm),
        ),
      ],
    );
  }
}

class _ResultSheet extends StatelessWidget {
  const _ResultSheet({
    required this.content,
    required this.onCriteriaHelp,
    required this.onClose,
  });

  final AiResultUi content;
  final VoidCallback onCriteriaHelp;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return _SheetFrame(
      id: AiReviewTestIds.resultSheetRoot,
      children: [
        Row(
          children: [
            Expanded(
              child: TestId(
                AiReviewTestIds.resultSheetOverallScore,
                child: Semantics(
                  label: content.scoreA11yLabel,
                  excludeSemantics: true,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        content.scoreText,
                        style: tokens.text.title1.copyWith(
                          color: tokens.colors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '/ 10',
                        style: tokens.text.headline.copyWith(
                          color: tokens.colors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            TestId.button(
              AiReviewTestIds.resultSheetCriteriaInfoButton,
              child: IconButton(
                tooltip: Copy.aiResultCriteriaHelp,
                icon: const Icon(Icons.help_outline),
                onPressed: onCriteriaHelp,
              ),
            ),
            _CloseButton(
              id: AiReviewTestIds.resultSheetCloseButton,
              onPressed: onClose,
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (final row in content.criteria)
          TestId(
            AiReviewTestIds.resultSheetCriteriaItem(row.key),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      row.label,
                      style: tokens.text.subheadline.copyWith(
                        color: tokens.colors.textSecondary,
                      ),
                    ),
                  ),
                  Text(
                    row.scoreText,
                    style: tokens.text.subheadline.copyWith(
                      color: tokens.colors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (content.showPerspectiveBadge)
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TestId(
                AiReviewTestIds.resultSheetDistinctiveBadge,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: tokens.colors.calendarCell,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    child: Text(
                      Copy.aiResultPerspectiveBadge,
                      style: tokens.text.caption.copyWith(
                        color: tokens.colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        const SizedBox(height: 16),
        TestId(
          AiReviewTestIds.resultSheetFeedbackSummary,
          child: Text(
            content.summary,
            style: tokens.text.headline
                .copyWith(color: tokens.colors.textPrimary)
                .copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        for (var i = 0; i < content.sections.length; i++)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: TestId(
              _sectionIds[i],
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    content.sections[i].title,
                    style: tokens.text.footnote.copyWith(
                      color: tokens.colors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    content.sections[i].body,
                    style: tokens.text.subheadline.copyWith(
                      color: tokens.colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  static const _sectionIds = [
    AiReviewTestIds.resultSheetFeedbackStrength,
    AiReviewTestIds.resultSheetFeedbackWeakness,
    AiReviewTestIds.resultSheetFeedbackSuggestion,
  ];
}

class _FailedSheet extends StatelessWidget {
  const _FailedSheet({required this.reason, required this.onConfirm});

  final String? reason;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return _SheetFrame(
      id: AiReviewTestIds.failedSheetRoot,
      children: [
        Text(
          Copy.aiFailedTitle,
          style: tokens.text.title3.copyWith(color: tokens.colors.textPrimary),
        ),
        if (reason != null) ...[
          const SizedBox(height: 8),
          TestId(
            AiReviewTestIds.failedSheetMessage,
            child: Text(
              reason!,
              style: tokens.text.subheadline.copyWith(
                color: tokens.colors.textSecondary,
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        TestId.button(
          AiReviewTestIds.failedSheetConfirmButton,
          child: ChalkakButton(
            onPressed: onConfirm,
            label: Copy.aiFailedConfirm,
          ),
        ),
      ],
    );
  }
}

/// 결과 시트 위의 "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그. 본문 문구는 소스에서
/// 확인하지 못해(spec 확인 필요) 제목과 "확인"만 둔다.
class AiReviewCriteriaDialog extends StatelessWidget {
  const AiReviewCriteriaDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return TestId(
      AiReviewTestIds.resultSheetCriteriaDialog,
      child: ChalkakDialog(
        title: Copy.aiResultCriteriaDialogTitle,
        actions: [
          ChalkakDialogButton(
            label: Copy.commonConfirm,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}
