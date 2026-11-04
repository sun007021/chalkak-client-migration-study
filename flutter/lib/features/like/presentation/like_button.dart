import 'package:flutter/material.dart';

import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/selectable_test_id.dart';
import '../../../core/ui/test_id.dart';

/// 하트 버튼과 좋아요 수. 전시 그리드·피드가 같이 쓴다(screens-b §3).
///
/// - [buttonId]를 단 버튼은 enabled·selected(= [isLiked])를 접근성 속성으로 노출한다.
/// - [countId]를 단 별도 요소에 [likeCount]를 숫자 문자열 그대로 그린다.
/// - [enabled]가 false이면 눌러도 [onPressed]를 부르지 않는다.
/// - [onImage]가 true면 사진 위 배지 모양이다: 하트 18 + 숫자 subheadline, 모두 textOnImage,
///   옅은 그림자(검정 25%, blur 2, y 1)를 깔아 밝은 사진에서도 읽힌다. 하트는 `ic_heart`/`ic_heart_filled`(템플릿 색).
/// - 아니면 피드 행 모양이다: 하트 24 + 숫자 body, 좋아요면 actionPrimary, 아니면 textSecondary.
///
/// 하트 애니메이션은 원본에 없어 넣지 않는다(아이콘을 바로 바꾼다).
class LikeButton extends StatelessWidget {
  const LikeButton({
    super.key,
    required this.buttonId,
    required this.countId,
    required this.isLiked,
    required this.likeCount,
    required this.onPressed,
    this.enabled = true,
    this.onImage = false,
  });

  final String buttonId;
  final String countId;
  final bool isLiked;
  final int likeCount;
  final bool enabled;
  final bool onImage;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final color = onImage
        ? tokens.colors.textOnImage
        : (isLiked ? tokens.colors.actionPrimary : tokens.colors.textSecondary);
    final iconSize = onImage ? 18.0 : 24.0;
    final baseStyle = onImage ? tokens.text.subheadline : tokens.text.body;
    final shadows = onImage
        ? const [
            Shadow(
              color: Color.fromRGBO(0, 0, 0, 0.25),
              blurRadius: 2,
              offset: Offset(0, 1),
            ),
          ]
        : null;
    final icon = ChalkakIcon(
      isLiked ? ChalkakIcon.heartFilled : ChalkakIcon.heart,
      size: iconSize,
      color: color,
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SelectableTestId(
          buttonId,
          selected: isLiked,
          child: Semantics(
            button: true,
            enabled: enabled,
            onTap: enabled ? onPressed : null,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: enabled ? onPressed : null,
              // 터치 영역은 44 이상.
              child: SizedBox(
                width: 44,
                height: 44,
                child: Center(
                  child: onImage
                      ? Stack(
                          alignment: Alignment.center,
                          children: [
                            // 흰 사진 위 가독성용 옅은 그림자(검정 25%, y 1).
                            Transform.translate(
                              offset: const Offset(0, 1),
                              child: ChalkakIcon(
                                isLiked
                                    ? ChalkakIcon.heartFilled
                                    : ChalkakIcon.heart,
                                size: iconSize,
                                color: const Color.fromRGBO(0, 0, 0, 0.25),
                              ),
                            ),
                            icon,
                          ],
                        )
                      : icon,
                ),
              ),
            ),
          ),
        ),
        TestId(
          countId,
          child: Text(
            '$likeCount',
            style: baseStyle.copyWith(color: color, shadows: shadows),
          ),
        ),
      ],
    );
  }
}
