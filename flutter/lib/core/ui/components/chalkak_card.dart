import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';
import 'chalkak_icon.dart';

/// 설정 카드(screens-c §1.5): surfaceElevated, 라운드 large 16, 아주 옅은 그림자(검정 8%, blur 2, y 1).
/// 진한 Material elevation 그림자는 쓰지 않는다(README §2.3).
class ChalkakCard extends StatelessWidget {
  const ChalkakCard({super.key, required this.child, this.color});

  final Widget child;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color ?? tokens.colors.surfaceElevated,
        borderRadius: BorderRadius.circular(tokens.radius.large),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(0, 0, 0, 0.08),
            blurRadius: 2,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(tokens.radius.large),
        child: child,
      ),
    );
  }
}

/// 카드 안 구분선: 높이 1 border, 좌우 20 들여쓰기.
class ChalkakCardDivider extends StatelessWidget {
  const ChalkakCardDivider({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: SizedBox(
      height: 1,
      child: ColoredBox(color: context.tokens.colors.border),
    ),
  );
}

/// 섹션 라벨: callout textMuted.
class ChalkakSectionLabel extends StatelessWidget {
  const ChalkakSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Text(
      text,
      style: tokens.text.callout.copyWith(color: tokens.colors.textMuted),
    );
  }
}

/// 카드 안 행: 제목 callout, 가운데 Spacer, [trailing]. 좌우 20 / 위아래 16(스위치 행은 [verticalPadding]로 줄인다).
/// [onTap]이 있으면 행 전체가 눌리고 눌림 효과는 없다. [chevron]이면 오른쪽에 화살표를 붙인다.
class ChalkakListRow extends StatelessWidget {
  const ChalkakListRow({
    super.key,
    required this.title,
    this.titleColor,
    this.trailing,
    this.chevron = false,
    this.onTap,
    this.verticalPadding = 16,
  });

  final String title;
  final Color? titleColor;
  final Widget? trailing;
  final bool chevron;
  final VoidCallback? onTap;
  final double verticalPadding;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final row = Padding(
      padding: EdgeInsets.symmetric(horizontal: 20, vertical: verticalPadding),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: tokens.text.callout.copyWith(
                color: titleColor ?? tokens.colors.textPrimary,
              ),
            ),
          ),
          ?trailing,
          if (chevron)
            ChalkakIcon(
              ChalkakIcon.chevronRight,
              size: 13,
              color: tokens.colors.textMuted,
            ),
        ],
      ),
    );
    if (onTap == null) return row;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: row,
    );
  }
}
