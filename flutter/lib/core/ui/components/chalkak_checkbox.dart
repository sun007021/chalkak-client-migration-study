import 'package:flutter/widgets.dart';

import 'chalkak_icon.dart';

/// 체크박스(screens-a §1.5). 22x22 원색 아이콘 `ic_checkbox_*`, 애니메이션 없이 즉시 교체한다.
/// 터치 영역은 호출한 행이 넓게 잡는다(약관 행 전체).
class ChalkakCheckbox extends StatelessWidget {
  const ChalkakCheckbox({super.key, required this.checked});

  final bool checked;

  @override
  Widget build(BuildContext context) => ChalkakIcon(
    checked ? ChalkakIcon.checkboxSelected : ChalkakIcon.checkboxUnselected,
    size: 22,
  );
}
