import 'package:flutter/cupertino.dart' show CupertinoPicker;
import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/test_id.dart';
import '../domain/date_picker_rules.dart';
import 'display_test_ids.dart';

/// "날짜 선택" 시트(REQ-DISP-007~009). 년/월/일 휠은 [DatePickerRules] 범위만 보여 준다.
/// 위젯 id: sheet 루트 `display.date-picker-sheet`, 휠 `display.date-picker-year|month|day`,
/// 확인 `display.date-picker-confirm-button`. 제목은 `Copy.displayPickerTitle`, 항목은
/// `Copy.displayPickerYear|Month|Day`의 `{n}`을 채운다. 확인하면 [DatePickerRules.adjust]로 맞춘
/// 날짜를 [onConfirm]에 준다.
class DatePickerSheet extends StatefulWidget {
  const DatePickerSheet({
    super.key,
    required this.initial,
    required this.today,
    required this.onConfirm,
  });

  final KstDate initial;
  final KstDate today;
  final ValueChanged<KstDate> onConfirm;

  @override
  State<DatePickerSheet> createState() => _DatePickerSheetState();
}

class _DatePickerSheetState extends State<DatePickerSheet> {
  static const double _wheelHeight = 180;

  late KstDate _picked;

  @override
  void initState() {
    super.initState();
    _picked = _adjusted(widget.initial);
  }

  KstDate _adjusted(KstDate date) => DatePickerRules.adjust(
    year: date.year,
    month: date.month,
    day: date.day,
    today: widget.today,
  );

  /// 한 휠을 돌리면 나머지 휠이 가리키는 값도 유효한 날짜로 맞춘다.
  void _pick({int? year, int? month, int? day}) {
    final next = DatePickerRules.adjust(
      year: year ?? _picked.year,
      month: month ?? _picked.month,
      day: day ?? _picked.day,
      today: widget.today,
    );
    if (next != _picked) setState(() => _picked = next);
  }

  @override
  Widget build(BuildContext context) {
    final today = widget.today;
    return TestId(
      DisplayTestIds.datePickerSheet,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                Copy.displayPickerTitle,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: _wheelHeight,
                child: Row(
                  children: [
                    Expanded(
                      child: _Wheel(
                        id: DisplayTestIds.datePickerYear,
                        values: DatePickerRules.years(today: today),
                        selected: _picked.year,
                        template: Copy.displayPickerYear,
                        onChanged: (value) => _pick(year: value),
                      ),
                    ),
                    Expanded(
                      child: _Wheel(
                        id: DisplayTestIds.datePickerMonth,
                        values: DatePickerRules.months(
                          year: _picked.year,
                          today: today,
                        ),
                        selected: _picked.month,
                        template: Copy.displayPickerMonth,
                        onChanged: (value) => _pick(month: value),
                      ),
                    ),
                    Expanded(
                      child: _Wheel(
                        id: DisplayTestIds.datePickerDay,
                        values: DatePickerRules.days(
                          year: _picked.year,
                          month: _picked.month,
                          today: today,
                        ),
                        selected: _picked.day,
                        template: Copy.displayPickerDay,
                        onChanged: (value) => _pick(day: value),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              TestId.button(
                DisplayTestIds.datePickerConfirmButton,
                child: FilledButton(
                  onPressed: () => widget.onConfirm(_picked),
                  child: const Text(Copy.commonConfirm),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 값 목록 하나를 돌리는 휠. 목록이나 선택값이 바깥에서 바뀌면 휠 위치를 맞춘다.
class _Wheel extends StatefulWidget {
  const _Wheel({
    required this.id,
    required this.values,
    required this.selected,
    required this.template,
    required this.onChanged,
  });

  final String id;
  final List<int> values;
  final int selected;

  /// `{n}`을 값으로 채우는 항목 문구.
  final String template;
  final ValueChanged<int> onChanged;

  @override
  State<_Wheel> createState() => _WheelState();
}

class _WheelState extends State<_Wheel> {
  static const double _itemExtent = 40;

  late final FixedExtentScrollController _controller =
      FixedExtentScrollController(initialItem: _indexOfSelected);

  int get _indexOfSelected {
    final index = widget.values.indexOf(widget.selected);
    return index < 0 ? 0 : index;
  }

  @override
  void didUpdateWidget(_Wheel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final index = _indexOfSelected;
    if (!_controller.hasClients || _controller.selectedItem == index) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _controller.hasClients) _controller.jumpToItem(index);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final values = widget.values;
    return TestId(
      widget.id,
      child: CupertinoPicker(
        scrollController: _controller,
        itemExtent: _itemExtent,
        onSelectedItemChanged: (index) {
          if (index >= 0 && index < values.length) {
            widget.onChanged(values[index]);
          }
        },
        children: [
          for (final value in values)
            Center(child: Text(Copy.fill(widget.template, {'n': '$value'}))),
        ],
      ),
    );
  }
}
