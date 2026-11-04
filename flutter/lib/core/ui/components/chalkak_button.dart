import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';

/// 주 버튼(screens-a §1.1). 높이·라운드·비활성 색은 테마의 `FilledButtonTheme`가 입힌다:
/// callout, 가로 24 / 세로 17, 라운드 12, 활성 actionPrimary, 비활성 actionPrimary 12% + textPrimary 글자.
/// 눌림은 옅은 ripple(Android)이고 iOS 원본처럼 시각 효과를 더하지 않는다.
class ChalkakButton extends StatelessWidget {
  const ChalkakButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.fillsWidth = true,
    this.verticalPadding = 17,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool fillsWidth;
  final double verticalPadding;

  @override
  Widget build(BuildContext context) {
    final button = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        padding: EdgeInsets.symmetric(
          horizontal: context.tokens.spacing.xl,
          vertical: verticalPadding,
        ),
      ),
      child: Text(label),
    );
    return fillsWidth
        ? SizedBox(width: double.infinity, child: button)
        : button;
  }
}

/// 아웃라인 버튼(screens-a §1.2). 테두리 1 border, 활성·비활성 모두 같고 비활성 글자만 textMuted.
class ChalkakOutlinedButton extends StatelessWidget {
  const ChalkakOutlinedButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.fillsWidth = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool fillsWidth;

  @override
  Widget build(BuildContext context) {
    final button = OutlinedButton(onPressed: onPressed, child: Text(label));
    return fillsWidth
        ? SizedBox(width: double.infinity, child: button)
        : button;
  }
}
