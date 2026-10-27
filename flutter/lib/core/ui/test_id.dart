import 'package:flutter/widgets.dart';

/// testids.md의 식별자를 `Semantics(identifier:)`와 `Key`에 같은 값으로 단다.
/// - 기본: 자식 시맨틱을 그대로 두고 식별자만 붙인다(루트, 텍스트, 표시 요소).
/// - [TestId.button]: 버튼의 enabled·라벨을 한 노드로 합쳐 식별자 노드가 상태를 노출한다.
class TestId extends StatelessWidget {
  const TestId(this.id, {super.key, required this.child}) : _merge = false;

  const TestId.button(this.id, {super.key, required this.child})
    : _merge = true;

  final String id;
  final Widget child;
  final bool _merge;

  @override
  Widget build(BuildContext context) {
    if (_merge) {
      return MergeSemantics(
        key: Key(id),
        child: Semantics(identifier: id, child: child),
      );
    }
    return Semantics(
      key: Key(id),
      identifier: id,
      container: true,
      child: child,
    );
  }
}
