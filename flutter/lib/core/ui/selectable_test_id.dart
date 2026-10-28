import 'package:flutter/widgets.dart';

/// 선택 상태가 있는 버튼(정렬 탭, 하트)의 testID. `Semantics(identifier:)`와 `Key`에 같은 값을 쓰고,
/// 버튼의 enabled·라벨과 함께 selected를 한 노드로 노출한다(testids.md §2).
class SelectableTestId extends StatelessWidget {
  const SelectableTestId(
    this.id, {
    super.key,
    required this.selected,
    required this.child,
  });

  final String id;
  final bool selected;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return MergeSemantics(
      key: Key(id),
      child: Semantics(identifier: id, selected: selected, child: child),
    );
  }
}
