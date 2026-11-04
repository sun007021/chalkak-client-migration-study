import 'dart:io' show Platform;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';

/// iOS 26 Liquid Glass 근사(docs/design/README.md §5.2, Flutter 행).
/// 원본 근거: ChalkakBottomBar.swift:59-151, ChalkakNavigationButton.swift:56-83.
///
/// 유리는 iOS 26 이상에서만 쓴다. Android·iOS 26 미만·접근성 대체 설정은 평면 그대로다.

/// "Version 26.0 (Build 23A340)" 같은 [Platform.operatingSystemVersion]에서 주 버전을 읽는다.
/// 읽지 못하면 null.
int? parseIosMajorVersion(String operatingSystemVersion) {
  final match = RegExp(r'(\d+)(?:\.\d+)*').firstMatch(operatingSystemVersion);
  return match == null ? null : int.tryParse(match.group(1)!);
}

/// 유리를 쓸지 판단한다. [platform]은 iOS, [iosMajorVersion]은 26 이상, [reduceTransparency]는 꺼져 있어야 한다.
bool resolveUsesGlass({
  required TargetPlatform platform,
  required int? iosMajorVersion,
  required bool reduceTransparency,
}) =>
    platform == TargetPlatform.iOS &&
    iosMajorVersion != null &&
    iosMajorVersion >= 26 &&
    !reduceTransparency;

/// 실제 기기에서의 iOS 주 버전. iOS가 아니거나 웹이면 null.
int? _deviceIosMajorVersion() {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return null;
  try {
    return parseIosMajorVersion(Platform.operatingSystemVersion);
  } on Object {
    return null;
  }
}

/// 테스트나 미리보기에서 유리 여부를 주입한다. 없으면 기기 상태로 판단한다.
class ChalkakGlassScope extends InheritedWidget {
  const ChalkakGlassScope({
    super.key,
    required this.usesGlass,
    required super.child,
  });

  final bool usesGlass;

  /// [context] 아래에서 유리를 쓰는지. 주입된 값이 있으면 그것, 없으면 기기 판단.
  /// Flutter는 "투명도 줄이기"를 직접 알려 주지 않아, 가장 가까운 접근성 신호인
  /// 고대비(`MediaQuery.highContrast`)를 대신 쓴다.
  static bool of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<ChalkakGlassScope>();
    if (scope != null) return scope.usesGlass;
    return resolveUsesGlass(
      platform: defaultTargetPlatform,
      iosMajorVersion: _deviceIosMajorVersion(),
      reduceTransparency: MediaQuery.maybeHighContrastOf(context) ?? false,
    );
  }

  @override
  bool updateShouldNotify(ChalkakGlassScope oldWidget) =>
      usesGlass != oldWidget.usesGlass;
}

/// 유리 재질 상수(README §5.2).
class ChalkakGlassSpec {
  const ChalkakGlassSpec._();

  static const double blurSigma = 20;
  static const double backgroundAlpha = 0.30;
  static const double borderAlpha = 0.35;
  static const double borderWidth = 0.5;
  static const double lensAlpha = 0.45;
  static const double sheetAlpha = 0.70;
}

/// 블러 위에 `background` 30% 채움 + 흰색 35% 0.5px 테두리를 얹은 면.
/// [fill]을 주면 채움 색을 바꾼다(시트는 surfaceElevated 70%).
class GlassSurface extends StatelessWidget {
  const GlassSurface({
    super.key,
    required this.shape,
    required this.child,
    this.fill,
    this.border = true,
  });

  final OutlinedBorder shape;
  final Widget child;
  final Color? fill;
  final bool border;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    final side = border
        ? BorderSide(
            color: Colors.white.withValues(alpha: ChalkakGlassSpec.borderAlpha),
            width: ChalkakGlassSpec.borderWidth,
          )
        : BorderSide.none;
    return ClipPath(
      clipper: ShapeBorderClipper(shape: shape),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(
          sigmaX: ChalkakGlassSpec.blurSigma,
          sigmaY: ChalkakGlassSpec.blurSigma,
        ),
        child: DecoratedBox(
          decoration: ShapeDecoration(
            color:
                fill ??
                colors.background.withValues(
                  alpha: ChalkakGlassSpec.backgroundAlpha,
                ),
            shape: shape.copyWith(side: side),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// 시트 본문을 감싼다. 유리면 블러 + surfaceElevated 70%, 아니면 그대로 둔다.
class GlassSheetSurface extends StatelessWidget {
  const GlassSheetSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return GlassSurface(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(tokens.radius.sheet),
        ),
      ),
      fill: tokens.colors.surfaceElevated.withValues(
        alpha: ChalkakGlassSpec.sheetAlpha,
      ),
      border: false,
      child: child,
    );
  }
}

/// `showModalBottomSheet`의 유리 대응판. 유리면 시트 배경을 투명하게 하고 [GlassSheetSurface]로 그린다.
Future<T?> showChalkakBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
  bool showDragHandle = false,
  bool useSafeArea = false,
  bool enableDrag = true,
}) {
  final glass = ChalkakGlassScope.of(context);
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    showDragHandle: showDragHandle,
    useSafeArea: useSafeArea,
    enableDrag: enableDrag,
    backgroundColor: glass ? Colors.transparent : null,
    elevation: glass ? 0 : null,
    builder: glass
        ? (sheetContext) => GlassSheetSurface(child: builder(sheetContext))
        : builder,
  );
}
