import 'package:flutter/widgets.dart';

import '../../../core/time/kst_date.dart';

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
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
