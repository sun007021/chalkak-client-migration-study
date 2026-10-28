import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_format.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../domain/home_models.dart';
import '../domain/home_state.dart';
import 'home_test_ids.dart';

/// 이번 주 기록: 제목, 사진이 있는 날 수 "N/7", 일~토 7칸, "보러가기".
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
    return TestId(
      HomeTestIds.weekSection,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(
              count: weekly is WeeklyReady ? weekly.recordedCount : null,
              onMorePressed: onMorePressed,
            ),
            const SizedBox(height: 12),
            switch (weekly) {
              WeeklyLoading() => const SizedBox(
                height: 72,
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              WeeklyReady(:final days) => Row(
                children: [
                  for (final day in days)
                    Expanded(
                      child: _DayCell(
                        day: day,
                        onPressed: () => onDayPressed(day.date),
                      ),
                    ),
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

class _Header extends StatelessWidget {
  const _Header({required this.count, required this.onMorePressed});

  final int? count;
  final VoidCallback onMorePressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Text(Copy.homeWeeklyTitle, style: theme.textTheme.titleMedium),
        if (count != null) ...[
          const SizedBox(width: 8),
          Text('$count/7', style: theme.textTheme.bodyMedium),
        ],
        const Spacer(),
        TestId.button(
          HomeTestIds.weekMoreLink,
          child: TextButton(
            onPressed: onMorePressed,
            child: const Text(Copy.homeWeeklyMore),
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
    final theme = Theme.of(context);
    final entry = day.entry;
    final date = day.date;
    return TestId(
      HomeTestIds.weekDay(date.toApiString()),
      child: InkWell(
        // 빈 칸은 눌러도 아무 일도 없다(REQ-HOME-023).
        onTap: entry == null ? null : onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
          child: Column(
            children: [
              Text(
                KstFormat.weekdayHeaders[date.weekdayIndex],
                style: theme.textTheme.labelSmall,
              ),
              const SizedBox(height: 4),
              AspectRatio(
                aspectRatio: 3 / 4,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: entry == null
                      ? ColoredBox(
                          color: theme.colorScheme.surfaceContainerHighest,
                        )
                      : TestId(
                          HomeTestIds.weekPhoto(date.toApiString()),
                          child: AppNetworkImage(url: entry.thumbnailImageUrl),
                        ),
                ),
              ),
              const SizedBox(height: 4),
              Text('${date.day}', style: theme.textTheme.labelSmall),
              // 라벨이 없는 칸과 높이를 맞추려고 자리를 항상 둔다.
              SizedBox(
                height: 16,
                child: entry?.status == CalendarStatus.pending
                    ? const Text(
                        Copy.homeWeeklyPending,
                        style: TextStyle(fontSize: 10),
                      )
                    : null,
              ),
            ],
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
            child: Text(Copy.homeWeeklyError),
          ),
        ),
        TestId.button(
          HomeTestIds.weekRetryButton,
          child: TextButton(
            onPressed: onRetry,
            child: const Text(Copy.commonRetry),
          ),
        ),
      ],
    );
  }
}
