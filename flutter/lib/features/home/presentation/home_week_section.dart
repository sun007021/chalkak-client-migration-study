import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_format.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../domain/home_models.dart';
import '../domain/home_state.dart';
import 'home_test_ids.dart';

/// 이번 주 기록(screens-a §7.6): 제목 headline bold + "N/7" caption semibold, "보러가기" + chevron,
/// 일~토 7칸(정사각, calendarCell, 라운드 small, 칸 간격 sm). 사진이 없는 칸은 요일 기호를 칸 안에 그린다.
class HomeWeekSection extends StatelessWidget {
  const HomeWeekSection({
    super.key,
    required this.weekly,
    required this.onDayPressed,
    required this.onMorePressed,
    required this.onRetry,
  });

  final WeeklyState weekly;
  final void Function(KstDate date) onDayPressed;
  final VoidCallback onMorePressed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final weekly = this.weekly;
    final spacing = context.tokens.spacing;
    return TestId(
      HomeTestIds.weekSection,
      child: Padding(
        // 피드백 카드가 없을 때 위 간격 xxl(40).
        padding: EdgeInsets.fromLTRB(
          spacing.screenHorizontal,
          spacing.xxl,
          spacing.screenHorizontal,
          0,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(
              count: weekly is WeeklyReady ? weekly.recordedCount : null,
              onMorePressed: onMorePressed,
            ),
            SizedBox(height: spacing.lg),
            switch (weekly) {
              WeeklyLoading() => const _WeekSkeleton(),
              WeeklyReady(:final days) => Row(
                children: [
                  for (var i = 0; i < days.length; i++) ...[
                    if (i > 0) SizedBox(width: spacing.sm),
                    Expanded(
                      child: _DayCell(
                        day: days[i],
                        onPressed: () => onDayPressed(days[i].date),
                      ),
                    ),
                  ],
                ],
              ),
              WeeklyError() => _Error(onRetry: onRetry),
            },
          ],
        ),
      ),
    );
  }
}

class _WeekSkeleton extends StatelessWidget {
  const _WeekSkeleton();

  @override
  Widget build(BuildContext context) {
    final spacing = context.tokens.spacing;
    return Row(
      children: [
        for (var i = 0; i < 7; i++) ...[
          if (i > 0) SizedBox(width: spacing.sm),
          Expanded(
            child: AspectRatio(
              aspectRatio: 1,
              child: ChalkakSkeleton(
                borderRadius: BorderRadius.circular(
                  context.tokens.radius.small,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.count, required this.onMorePressed});

  final int? count;
  final VoidCallback onMorePressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(
      children: [
        Text(
          Copy.homeWeeklyTitle,
          style: tokens.text.headline.copyWith(fontWeight: FontWeight.w700),
        ),
        if (count != null) ...[
          SizedBox(width: tokens.spacing.xs),
          Text(
            '$count/7',
            style: tokens.text.caption.copyWith(
              color: tokens.colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const Spacer(),
        TestId.button(
          HomeTestIds.weekMoreLink,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onMorePressed,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    Copy.homeWeeklyMore,
                    style: tokens.text.caption.copyWith(
                      color: tokens.colors.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 2),
                  ChalkakIcon(
                    ChalkakIcon.chevronRight,
                    size: 12,
                    color: tokens.colors.textPrimary,
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.onPressed});

  final WeekDay day;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final entry = day.entry;
    final date = day.date;
    return TestId(
      HomeTestIds.weekDay(date.toApiString()),
      child: GestureDetector(
        // 빈 칸은 눌러도 아무 일도 없다(REQ-HOME-023). 눌림 효과는 두지 않는다(UnhighlightedButtonStyle).
        behavior: HitTestBehavior.opaque,
        onTap: entry == null ? null : onPressed,
        child: AspectRatio(
          aspectRatio: 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(tokens.radius.small),
            child: ColoredBox(
              color: tokens.colors.calendarCell,
              child: entry == null
                  ? Center(
                      child: Text(
                        KstFormat.weekdayHeaders[date.weekdayIndex],
                        style: tokens.text.caption.copyWith(
                          color: tokens.colors.textSecondary,
                        ),
                      ),
                    )
                  : Stack(
                      fit: StackFit.expand,
                      children: [
                        TestId(
                          HomeTestIds.weekPhoto(date.toApiString()),
                          child: AppNetworkImage(url: entry.thumbnailImageUrl),
                        ),
                        if (entry.status == CalendarStatus.pending)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: ColoredBox(
                              color: tokens.colors.scrim,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 1,
                                ),
                                child: Text(
                                  Copy.homeWeeklyPending,
                                  textAlign: TextAlign.center,
                                  style: tokens.text.caption.copyWith(
                                    color: tokens.colors.textOnImage,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(
          child: TestId(
            HomeTestIds.weekError,
            child: ChalkakStatusText(Copy.homeWeeklyError),
          ),
        ),
        TestId.button(
          HomeTestIds.weekRetryButton,
          child: Semantics(
            button: true,
            label: Copy.commonRetry,
            excludeSemantics: true,
            onTap: onRetry,
            child: ChalkakRetryCircleButton(
              onPressed: onRetry,
              size: 32,
              iconSize: 15,
            ),
          ),
        ),
      ],
    );
  }
}
