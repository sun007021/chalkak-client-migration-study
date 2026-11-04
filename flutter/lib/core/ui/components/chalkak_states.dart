import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';
import 'chalkak_skeleton.dart';

/// 화면 안 작은 로딩 표시. 기본 스피너만 덩그러니 두지 않고, 쓰는 자리에 맞는 크기로
/// actionPrimary 스피너를 그린다(테마의 ProgressIndicator 색). 스켈레톤을 쓸 수 있는 자리는
/// [ChalkakSkeleton]을 먼저 쓰고 이 위젯은 보조 표시로만 쓴다.
class ChalkakSpinner extends StatelessWidget {
  const ChalkakSpinner({super.key, this.size = 24});

  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CircularProgressIndicator(
      strokeWidth: size <= 24 ? 2 : 2.5,
      color: context.tokens.colors.actionPrimary,
    ),
  );
}

/// 둥근 재시도 버튼(screens-a §7.4: 지름 40 actionPrimary 원 + 새로고침 아이콘 18).
class ChalkakRetryCircleButton extends StatelessWidget {
  const ChalkakRetryCircleButton({
    super.key,
    required this.onPressed,
    this.size = 40,
    this.iconSize = 18,
    this.semanticLabel,
  });

  final VoidCallback onPressed;
  final double size;
  final double iconSize;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        // 터치 영역은 44 이상으로 넓힌다.
        child: SizedBox.square(
          dimension: size < 44 ? 44 : size,
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.actionPrimary,
                shape: BoxShape.circle,
              ),
              child: SizedBox.square(
                dimension: size,
                child: Icon(
                  Icons.refresh_rounded,
                  size: iconSize,
                  color: colors.onActionPrimary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 빈 상태(screens-c §1.6): 가운데 정렬, 제목 body textSecondary, 간격 8, 설명 subheadline textMuted.
class ChalkakEmptyState extends StatelessWidget {
  const ChalkakEmptyState({super.key, required this.title, this.description});

  final String title;
  final String? description;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: tokens.text.body.copyWith(color: tokens.colors.textSecondary),
        ),
        if (description != null) ...[
          SizedBox(height: tokens.spacing.sm),
          Text(
            description!,
            textAlign: TextAlign.center,
            style: tokens.text.subheadline.copyWith(
              color: tokens.colors.textMuted,
            ),
          ),
        ],
      ],
    );
  }
}

/// 섹션 상태 문구(footnote textSecondary). 로딩·오류·빈 안내가 같은 높이 줄을 쓴다.
class ChalkakStatusText extends StatelessWidget {
  const ChalkakStatusText(this.text, {super.key, this.textAlign});

  final String text;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Text(
      text,
      textAlign: textAlign,
      style: tokens.text.footnote.copyWith(color: tokens.colors.textSecondary),
    );
  }
}
