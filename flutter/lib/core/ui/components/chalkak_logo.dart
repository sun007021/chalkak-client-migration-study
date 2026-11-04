import 'package:flutter/material.dart';

import '../../copy/ko.g.dart';
import '../../design/chalkak_tokens.dart';

/// 브랜드 로고 글자(screens-a §1.7): "Chalkak", brand 30(Continuous), 자간 -0.42, textPrimary.
/// 접근성 이름은 앱 이름이다.
class ChalkakLogo extends StatelessWidget {
  const ChalkakLogo({super.key, this.style});

  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Semantics(
      label: Copy.appName,
      excludeSemantics: true,
      child: Text(
        'Chalkak',
        style: (style ?? tokens.text.brand).copyWith(
          color: tokens.colors.textPrimary,
        ),
      ),
    );
  }
}
