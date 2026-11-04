import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design/chalkak_tokens.dart';

/// 입력칸(screens-a §1.6). 배경 inputBackground, 라운드 input(14), 테두리 1(포커스 actionPrimary / 평소 border),
/// 안쪽 여백 lg(16), 커서 inputCursor, 자리표시 textInactive, 꺼짐 글자 textMuted.
/// [counter]가 있으면 오른쪽 아래에 subheadline textInactive로 그리고 아래 여백을 xl(24) 더 둔다.
/// 포커스 테두리 전환 애니메이션은 없다.
class ChalkakTextField extends StatefulWidget {
  const ChalkakTextField({
    super.key,
    required this.controller,
    this.hintText,
    this.enabled = true,
    this.readOnly = false,
    this.minLines = 1,
    this.maxLines = 1,
    this.minHeight,
    this.style,
    this.counter,
    this.keyboardType,
    this.textInputAction,
    this.inputFormatters,
    this.onChanged,
    this.autofocus = false,
    this.semanticLabel,
  });

  final TextEditingController controller;
  final String? hintText;
  final bool enabled;
  final bool readOnly;
  final int minLines;
  final int maxLines;
  final double? minHeight;
  final TextStyle? style;

  /// 오른쪽 아래 글자 수 표시(예: `3 / 1000`). 호출한 쪽이 testID를 감싸서 넘긴다.
  final Widget? counter;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final List<TextInputFormatter>? inputFormatters;
  final ValueChanged<String>? onChanged;
  final bool autofocus;
  final String? semanticLabel;

  @override
  State<ChalkakTextField> createState() => _ChalkakTextFieldState();
}

class _ChalkakTextFieldState extends State<ChalkakTextField> {
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(_onFocus);
  }

  void _onFocus() => setState(() {});

  @override
  void dispose() {
    _focus
      ..removeListener(_onFocus)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final style = (widget.style ?? tokens.text.body).copyWith(
      color: widget.enabled
          ? tokens.colors.textPrimary
          : tokens.colors.textMuted,
    );
    final field = TextField(
      controller: widget.controller,
      focusNode: _focus,
      enabled: widget.enabled,
      readOnly: widget.readOnly,
      autofocus: widget.autofocus,
      minLines: widget.minLines,
      maxLines: widget.maxLines,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      inputFormatters: widget.inputFormatters,
      onChanged: widget.onChanged,
      style: style,
      cursorColor: tokens.colors.inputCursor,
      decoration: InputDecoration(
        isDense: true,
        filled: false,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        disabledBorder: InputBorder.none,
        contentPadding: EdgeInsets.zero,
        hintText: widget.hintText,
        hintStyle: style.copyWith(color: tokens.colors.textInactive),
      ),
    );
    final bottom =
        tokens.spacing.lg + (widget.counter != null ? tokens.spacing.xl : 0);
    return Semantics(
      label: widget.semanticLabel,
      child: Container(
        constraints: BoxConstraints(minHeight: widget.minHeight ?? 0),
        decoration: BoxDecoration(
          color: tokens.colors.inputBackground,
          borderRadius: tokens.radius.inputShape,
          border: Border.all(
            color: _focus.hasFocus
                ? tokens.colors.actionPrimary
                : tokens.colors.border,
          ),
        ),
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                tokens.spacing.lg,
                tokens.spacing.lg,
                tokens.spacing.lg,
                bottom,
              ),
              child: field,
            ),
            if (widget.counter != null)
              Positioned(
                right: tokens.spacing.lg,
                bottom: tokens.spacing.lg,
                child: DefaultTextStyle(
                  style: tokens.text.subheadline.copyWith(
                    color: tokens.colors.textInactive,
                  ),
                  child: widget.counter!,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
