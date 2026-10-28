import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../domain/record_models.dart';
import '../domain/record_state.dart';
import 'record_test_ids.dart';

/// 요일 머리글과 일요일 시작 7열 달력 격자. 사진이 있는 칸만 누를 수 있다.
class RecordCalendarView extends StatelessWidget {
  const RecordCalendarView({
    super.key,
    required this.state,
    required this.onDayPressed,
  });

  final RecordState state;
  final void Function(KstDate date) onDayPressed;

  @override
  Widget build(BuildContext context) {
    final cells = state.grid.cells;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TestId(
          RecordTestIds.weekdayHeader,
          child: Row(
            children: [
              for (var i = 0; i < 7; i++)
                Expanded(
                  child: Center(
                    child: Text(
                      Copy.recordWeekday[i],
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        TestId(
          RecordTestIds.calendarGrid,
          child: Column(
            children: [
              for (var row = 0; row < cells.length ~/ 7; row++)
                Row(
                  children: [
                    for (var col = 0; col < 7; col++)
                      Expanded(child: _cell(cells[row * 7 + col])),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cell(KstDate? date) {
    if (date == null) return const AspectRatio(aspectRatio: 3 / 4);
    final photo = state.photoOn(date);
    return _DayCell(
      date: date,
      photo: photo,
      isToday: date == state.today,
      isSelected: date == state.selectedDate,
      onPressed: photo == null ? null : () => onDayPressed(date),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.photo,
    required this.isToday,
    required this.isSelected,
    required this.onPressed,
  });

  final KstDate date;
  final RecordPhoto? photo;
  final bool isToday;
  final bool isSelected;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final photo = this.photo;
    final border = isSelected
        ? Border.all(color: colors.primary, width: 3)
        : isToday
        ? Border.all(color: colors.tertiary, width: 2)
        : null;
    return TestId.button(
      RecordTestIds.day(date.toApiString()),
      child: Semantics(
        selected: isSelected,
        child: Padding(
          padding: const EdgeInsets.all(2),
          child: AspectRatio(
            aspectRatio: 3 / 4,
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(8),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: border,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (photo == null)
                        ColoredBox(color: colors.surfaceContainerHighest)
                      else
                        AppNetworkImage(url: photo.thumbnailImageUrl),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: ColoredBox(
                          color: photo == null
                              ? Colors.transparent
                              : Colors.black54,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(
                              '${date.day}',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: isToday
                                    ? FontWeight.w700
                                    : FontWeight.w400,
                                color: photo == null
                                    ? colors.onSurfaceVariant
                                    : Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (photo != null && photo.isPending)
                        const Positioned(
                          left: 2,
                          right: 2,
                          top: 2,
                          child: _PendingChip(),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PendingChip extends StatelessWidget {
  const _PendingChip();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.all(Radius.circular(4)),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 2, vertical: 1),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            Copy.recordPendingBadge,
            maxLines: 1,
            style: TextStyle(fontSize: 9, color: Colors.white),
          ),
        ),
      ),
    );
  }
}
