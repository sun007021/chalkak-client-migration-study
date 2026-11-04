import 'package:flutter/material.dart';

import '../../copy/ko.g.dart';
import '../../design/chalkak_tokens.dart';
import '../glass/chalkak_glass.dart';
import 'chalkak_icon.dart';

/// 뒤로가기/닫기 버튼(screens-c §1.3): 지름 48 터치 영역, 아이콘 24 iconPrimary, 눌림은 옅은 ripple 없이 즉시.
/// `ic_arrow_back` / `ic_close` SVG를 쓴다. 닫기는 Copy.commonClose가 접근성 이름이고,
/// 뒤로 가기 문구는 ko.json에 없어 호출한 쪽이 [label]을 줄 때만 붙는다.
class ChalkakNavButton extends StatelessWidget {
  const ChalkakNavButton.back({super.key, required this.onPressed, this.label})
    : _icon = ChalkakIcon.arrowBack,
      _defaultLabel = null;

  const ChalkakNavButton.close({super.key, required this.onPressed, this.label})
    : _icon = ChalkakIcon.close,
      _defaultLabel = Copy.commonClose;

  final VoidCallback? onPressed;
  final String? label;
  final String _icon;
  final String? _defaultLabel;

  /// 원본 지름(터치 영역).
  static const double size = 48;

  /// 유리일 때 보이는 원 지름(ChalkakNavigationButton.swift:56-83).
  static const double glassSize = 44;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    final icon = ChalkakIcon(_icon, size: 24, color: colors.iconPrimary);
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label ?? _defaultLabel,
      excludeSemantics: label != null || _defaultLabel != null,
      onTap: onPressed,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: SizedBox.square(
          dimension: size,
          child: Center(
            child: ChalkakGlassScope.of(context)
                ? SizedBox.square(
                    key: const Key('chalkak-nav-button-glass'),
                    dimension: glassSize,
                    child: GlassSurface(
                      shape: const CircleBorder(),
                      child: Center(child: icon),
                    ),
                  )
                : icon,
          ),
        ),
      ),
    );
  }
}
