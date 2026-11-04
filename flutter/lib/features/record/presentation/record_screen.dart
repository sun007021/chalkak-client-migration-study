import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../domain/record_state.dart';
import '../domain/record_view_model.dart';
import 'record_calendar_view.dart';
import 'record_month_picker_sheet.dart';
import 'record_selected_photo.dart';
import 'record_test_ids.dart';

/// 기록 탭 화면. [RecordViewModel] 상태를 그리기만 한다(testids.md 기록 절의 식별자를 단다).
///
/// - 루트 `record.root`, 월 헤더(이전/다음 화살표는 `canGoPrevious/Next`에 따라 비활성),
///   요일 머리글 `Copy.recordWeekday`, 7열 격자(오늘 강조), 선택한 날의 사진 영역, 저장 버튼.
/// - 내용 상태별 표시: 로딩 `record.loading`, 오류 `record.error-state`(401은
///   `record.login-required-state` + `record.login-button`, 400은 `record.invalid-month-message`,
///   그 밖은 `record.retry-button`), 빈 달 `record.empty-state`는 사진 0건일 때만.
/// - PENDING: `record.pending-badge`(탭하면 `record.pending-tooltip` 열기/닫기), 동작 버튼 없음.
///   APPROVED: `record.view-feed-button`·`record.view-display-button`.
/// - 날짜 칸 `record.day-{yyyy-mm-dd}`는 사진이 있을 때만 눌린다. 선택 상태를 시맨틱스에 노출한다.
/// - 화면 생성 시 [RecordViewModel.enter], 사라질 때 [RecordViewModel.onHidden]을 부르는 일은
///   셸 통합 단계에서 정한다(테스트는 VM을 직접 구동).
/// - 월 헤더는 오류·로딩 중에도 그대로 둔다. 사용자가 다른 달로 옮겨 갈 수 있어야 한다.
class RecordScreen extends StatelessWidget {
  const RecordScreen({super.key, required this.viewModel});

  final RecordViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return TestId(
      RecordTestIds.root,
      child: ListenableBuilder(
        listenable: viewModel,
        builder: (context, _) {
          final state = viewModel.state;
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _MonthHeader(
                  state: state,
                  onPrevious: viewModel.goToPreviousMonth,
                  onNext: viewModel.goToNextMonth,
                  onPickerPressed: () => showRecordMonthPickerSheet(
                    context,
                    options: state.availableMonths,
                    selected: state.selectedMonth,
                    onSelected: viewModel.selectMonth,
                  ),
                ),
                const SizedBox(height: 8),
                ..._body(context, state),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _body(BuildContext context, RecordState state) {
    return switch (state.content) {
      RecordLoading() => const [_Loading()],
      RecordFailed(:final failure) => [
        _ErrorView(
          failure: failure,
          onRetry: viewModel.retry,
          onLogin: viewModel.onLoginPressed,
        ),
      ],
      RecordReady(:final photos) => [
        RecordCalendarView(state: state, onDayPressed: viewModel.selectDate),
        const SizedBox(height: 16),
        if (photos.isEmpty)
          const TestId(RecordTestIds.emptyState, child: SizedBox.shrink())
        else if (state.selectedPhoto case final photo?)
          RecordSelectedPhoto(
            photo: photo,
            isTooltipOpen: state.isPendingTooltipOpen,
            onTogglePendingTooltip: viewModel.togglePendingTooltip,
            onViewFeed: viewModel.onViewFeedPressed,
            onViewDisplay: viewModel.onViewDisplayPressed,
          ),
        const SizedBox(height: 16),
        TestId.button(
          RecordTestIds.saveImageButton,
          child: TextButton(
            onPressed: state.isSaving ? null : viewModel.saveCalendarImage,
            style: TextButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              foregroundColor: context.tokens.colors.textMuted,
              textStyle: context.tokens.text.footnote,
            ),
            child: state.isSaving
                ? const ChalkakSpinner(size: 16)
                : const Text(Copy.recordSave),
          ),
        ),
      ],
    };
  }
}

class _MonthHeader extends StatelessWidget {
  const _MonthHeader({
    required this.state,
    required this.onPrevious,
    required this.onNext,
    required this.onPickerPressed,
  });

  final RecordState state;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onPickerPressed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        TestId.button(
          RecordTestIds.prevMonthButton,
          child: _ArrowButton(
            icon: ChalkakIcon.displayArrowLeft,
            onPressed: state.canGoPrevious ? onPrevious : null,
          ),
        ),
        Expanded(
          child: TestId(
            RecordTestIds.monthPickerButton,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onPickerPressed,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TestId(
                      RecordTestIds.monthLabel,
                      child: Text(
                        state.monthLabel,
                        style: context.tokens.text.title2.copyWith(
                          color: context.tokens.colors.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    ChalkakIcon(
                      ChalkakIcon.chevronDown,
                      size: 16,
                      color: context.tokens.colors.iconSecondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        TestId.button(
          RecordTestIds.nextMonthButton,
          child: _ArrowButton(
            icon: ChalkakIcon.displayArrowRight,
            onPressed: state.canGoNext ? onNext : null,
          ),
        ),
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const TestId(
      RecordTestIds.loading,
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 96),
        child: Center(child: ChalkakSpinner()),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.failure,
    required this.onRetry,
    required this.onLogin,
  });

  final RecordFailure failure;
  final VoidCallback onRetry;
  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    final message = switch (failure) {
      RecordFailure.unauthorized => const TestId(
        RecordTestIds.loginRequiredState,
        child: ChalkakStatusText(
          Copy.recordErr401,
          textAlign: TextAlign.center,
        ),
      ),
      RecordFailure.invalidMonth => const TestId(
        RecordTestIds.invalidMonthMessage,
        child: ChalkakStatusText(
          Copy.recordErr400,
          textAlign: TextAlign.center,
        ),
      ),
      RecordFailure.other => const ChalkakStatusText(
        Copy.recordErrOther,
        textAlign: TextAlign.center,
      ),
    };
    return TestId(
      RecordTestIds.errorState,
      child: Padding(
        padding: const EdgeInsets.only(top: 24, bottom: 48),
        child: Column(
          children: [
            message,
            const SizedBox(height: 16),
            switch (failure) {
              RecordFailure.unauthorized => TestId.button(
                RecordTestIds.loginButton,
                child: ChalkakButton(
                  onPressed: onLogin,
                  label: Copy.recordGuestLogin,
                  fillsWidth: false,
                ),
              ),
              RecordFailure.invalidMonth => const SizedBox.shrink(),
              RecordFailure.other => TestId.button(
                RecordTestIds.retryButton,
                child: TextButton(
                  onPressed: onRetry,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    textStyle: context.tokens.text.body,
                  ),
                  child: const Text(Copy.commonRetry),
                ),
              ),
            },
          ],
        ),
      ),
    );
  }
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({required this.icon, required this.onPressed});

  final String icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Semantics(
      button: true,
      enabled: enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: SizedBox.square(
          dimension: 48,
          child: Center(
            child: Opacity(
              opacity: enabled ? 1 : 0.35,
              child: ChalkakIcon(
                icon,
                size: 18,
                color: context.tokens.colors.iconPrimary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
