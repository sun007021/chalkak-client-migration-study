import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/test_id.dart';
import '../domain/record_models.dart';
import '../domain/record_month_picker.dart';
import 'record_test_ids.dart';

/// 월 선택 하단 시트. 선택지는 [options](최신순)뿐이고, 연도가 여럿이면 연도 칩으로 바꾼다.
/// 연도를 바꾸면 그 해에서 지금 월에 가장 가까운 달로 둔다. 달을 누르면 [onSelected]를 부르고 닫는다.
Future<void> showRecordMonthPickerSheet(
  BuildContext context, {
  required List<KstMonth> options,
  required KstMonth selected,
  required void Function(KstMonth month) onSelected,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => _MonthPickerSheet(
      options: options,
      selected: selected,
      onSelected: (month) {
        Navigator.of(sheetContext).pop();
        onSelected(month);
      },
    ),
  );
}

class _MonthPickerSheet extends StatefulWidget {
  const _MonthPickerSheet({
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final List<KstMonth> options;
  final KstMonth selected;
  final void Function(KstMonth month) onSelected;

  @override
  State<_MonthPickerSheet> createState() => _MonthPickerSheetState();
}

class _MonthPickerSheetState extends State<_MonthPickerSheet> {
  late int _year = widget.selected.year;

  @override
  Widget build(BuildContext context) {
    final years = RecordMonthPicker.years(widget.options);
    final visible = [
      for (final month in widget.options)
        if (month.year == _year) month,
    ];
    return TestId(
      RecordTestIds.monthPickerSheet,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                Copy.recordPickerTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (years.length > 1) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final year in years)
                      ChoiceChip(
                        label: Text('$year'),
                        selected: year == _year,
                        onSelected: (_) => setState(() => _year = year),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final month in visible)
                      TestId.button(
                        RecordTestIds.monthPickerItem(month.toApiString()),
                        child: ListTile(
                          selected: month == widget.selected,
                          title: Text(month.recordLabel),
                          trailing: month == widget.selected
                              ? const Icon(Icons.check)
                              : null,
                          onTap: () => widget.onSelected(month),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
