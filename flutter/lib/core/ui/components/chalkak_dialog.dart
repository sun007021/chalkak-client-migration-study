import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';
import '../test_id.dart';

/// 확인 다이얼로그(screens-c §1.2, Android `ChalkakConfirmDialog`).
/// 흰 카드(surfaceElevated, 라운드 large 16), 안쪽 여백 좌우 40 / 위 24 / 아래 26, 가운데 정렬.
/// 제목 title3, 제목→본문 8, 본문 callout textNeutral, 본문→버튼 23, 버튼은 가로 2등분 간격 10.
/// 어떤 위젯이든 [actions]로 넘기면 같은 폭으로 나란히 놓는다([ChalkakDialogButton] 권장).
class ChalkakDialog extends StatelessWidget {
  const ChalkakDialog({
    super.key,
    this.title,
    this.message,
    this.content,
    required this.actions,
    this.titleId,
    this.messageId,
  });

  final String? title;
  final String? message;

  /// [message] 대신 쓰는 임의 본문(입력칸 등). 왼쪽 정렬 폭 전체를 쓴다.
  final Widget? content;
  final List<Widget> actions;

  /// 제목·본문에 붙일 testID(있으면 해당 글자를 `TestId`로 감싼다).
  final String? titleId;
  final String? messageId;

  // ChalkakConfirmDialog.kt:52-57, 168-174
  static const _padding = EdgeInsets.fromLTRB(40, 24, 40, 26);
  static const _titleGap = 8.0;
  static const _bodyToButtons = 23.0;
  static const _buttonGap = 10.0;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Dialog(
      backgroundColor: tokens.colors.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      insetPadding: EdgeInsets.symmetric(horizontal: tokens.spacing.xl),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(tokens.radius.large),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 317),
        child: Padding(
          padding: _padding,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (title != null)
                _tagged(
                  titleId,
                  Text(
                    title!,
                    textAlign: TextAlign.center,
                    style: tokens.text.title3.copyWith(
                      color: tokens.colors.textPrimary,
                    ),
                  ),
                ),
              if (title != null && (message != null || content != null))
                const SizedBox(height: _titleGap),
              if (message != null)
                _tagged(
                  messageId,
                  Text(
                    message!,
                    textAlign: TextAlign.center,
                    style: tokens.text.callout.copyWith(
                      color: tokens.colors.textNeutral,
                    ),
                  ),
                ),
              if (content != null)
                SizedBox(width: double.infinity, child: content),
              const SizedBox(height: _bodyToButtons),
              Row(
                children: [
                  for (var i = 0; i < actions.length; i++) ...[
                    if (i > 0) const SizedBox(width: _buttonGap),
                    Expanded(child: actions[i]),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Widget _tagged(String? id, Widget child) =>
    id == null ? child : TestId(id, child: child);

/// [ChalkakDialog]의 버튼 종류. cancel은 actionSecondary 회색, primary는 actionPrimary,
/// destructive는 destructive 색이며 글자는 모두 흰색이다(ChalkakConfirmDialog.kt:80-102).
enum ChalkakDialogButtonKind { cancel, primary, destructive }

class ChalkakDialogButton extends StatelessWidget {
  const ChalkakDialogButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.kind = ChalkakDialogButtonKind.primary,
  });

  final String label;
  final VoidCallback? onPressed;
  final ChalkakDialogButtonKind kind;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    final (background, foreground) = switch (kind) {
      ChalkakDialogButtonKind.cancel => (
        colors.actionSecondary,
        colors.onActionSecondary,
      ),
      ChalkakDialogButtonKind.primary => (
        colors.actionPrimary,
        colors.onActionPrimary,
      ),
      ChalkakDialogButtonKind.destructive => (
        colors.destructive,
        colors.onActionPrimary,
      ),
    };
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        // 위아래 안쪽 여백 9.5, 라운드 button(12).
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9.5),
        minimumSize: const Size(0, 44),
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background.withValues(alpha: 0.12),
        disabledForegroundColor: colors.textPrimary,
      ),
      child: Text(label),
    );
  }
}
