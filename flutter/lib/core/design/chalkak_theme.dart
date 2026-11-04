import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'chalkak_tokens.dart';

/// 앱 전체 테마. Material 3를 쓰되 [ColorScheme]을 토큰으로 덮어 기본 보라/파랑이 보이지 않게 하고,
/// 글꼴은 번들 Pretendard, 라이트 고정이다(docs/design/README.md §1, §4).
/// 버튼·다이얼로그·시트·스위치·입력 같은 Material 컴포넌트도 여기서 원본 스펙을 입혀 두어
/// 화면 코드가 따로 꾸미지 않아도 원본과 같은 모양이 된다.
ThemeData buildChalkakTheme() {
  const tokens = ChalkakTokens();
  final c = tokens.colors;
  final t = tokens.text;
  final r = tokens.radius;
  final s = tokens.spacing;

  final scheme = ColorScheme(
    brightness: Brightness.light,
    primary: c.actionPrimary,
    onPrimary: c.onActionPrimary,
    primaryContainer: c.actionPrimary,
    onPrimaryContainer: c.onActionPrimary,
    secondary: c.actionPrimary,
    onSecondary: c.onActionPrimary,
    secondaryContainer: c.calendarCell,
    onSecondaryContainer: c.textPrimary,
    tertiary: c.accent,
    onTertiary: c.onActionPrimary,
    error: c.error,
    onError: c.onActionPrimary,
    surface: c.background,
    onSurface: c.textPrimary,
    onSurfaceVariant: c.textSecondary,
    surfaceTint: Colors.transparent,
    outline: c.border,
    outlineVariant: c.border,
    shadow: Colors.black,
    scrim: c.scrim,
    inverseSurface: c.actionPrimary,
    onInverseSurface: c.onActionPrimary,
    inversePrimary: c.onActionPrimary,
    surfaceContainerLowest: c.surfaceElevated,
    surfaceContainerLow: c.background,
    surfaceContainer: c.background,
    surfaceContainerHigh: c.surfaceElevated,
    surfaceContainerHighest: c.calendarCell,
  );

  // Material 역할 이름 -> 원본 타이포 이름. 스타일 없는 Text는 body/callout이 된다.
  final textTheme = TextTheme(
    displayLarge: t.display,
    displayMedium: t.display,
    displaySmall: t.title1,
    headlineLarge: t.title1,
    headlineMedium: t.title2,
    headlineSmall: t.title3,
    titleLarge: t.title3,
    titleMedium: t.headline,
    titleSmall: t.callout.copyWith(fontWeight: FontWeight.w600),
    bodyLarge: t.body,
    bodyMedium: t.callout,
    bodySmall: t.footnote,
    labelLarge: t.callout,
    labelMedium: t.subheadline,
    labelSmall: t.caption,
  ).apply(bodyColor: c.textPrimary, displayColor: c.textPrimary);

  final buttonShape = RoundedRectangleBorder(borderRadius: r.buttonShape);
  final buttonPadding = EdgeInsets.symmetric(
    horizontal: s.xl,
    vertical: _buttonVerticalPadding,
  );
  const noOverlay = WidgetStatePropertyAll<Color>(Colors.transparent);
  final ripple = c.textPrimary.withValues(alpha: 0.08);

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.background,
    canvasColor: c.background,
    fontFamily: ChalkakFonts.pretendard,
    textTheme: textTheme,
    primaryTextTheme: textTheme,
    // 눌림/스플래시는 textPrimary 8% 안팎(README §4). 보라 ripple 금지.
    splashColor: ripple,
    highlightColor: c.textPrimary.withValues(alpha: 0.04),
    hoverColor: c.textPrimary.withValues(alpha: 0.04),
    focusColor: c.textPrimary.withValues(alpha: 0.08),
    splashFactory: InkRipple.splashFactory,
    dividerColor: c.border,
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    iconTheme: IconThemeData(color: c.iconPrimary),
    extensions: const [tokens],
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        // 플랫폼 관례: iOS는 push 슬라이드 + 스와이프 뒤로, Android는 페이드(screens-c §6).
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.background,
      foregroundColor: c.textPrimary,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: t.headline.copyWith(color: c.textPrimary),
      systemOverlayStyle: chalkakSystemOverlayStyle,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        textStyle: WidgetStatePropertyAll(t.callout),
        padding: WidgetStatePropertyAll(buttonPadding),
        minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
        shape: WidgetStatePropertyAll(buttonShape),
        elevation: const WidgetStatePropertyAll(0),
        shadowColor: const WidgetStatePropertyAll(Colors.transparent),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        backgroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? c.actionPrimary.withValues(alpha: 0.12)
              : c.actionPrimary,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? c.textPrimary
              : c.onActionPrimary,
        ),
        overlayColor: WidgetStatePropertyAll(
          c.onActionPrimary.withValues(alpha: 0.12),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        textStyle: WidgetStatePropertyAll(t.callout),
        padding: WidgetStatePropertyAll(buttonPadding),
        minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
        shape: WidgetStatePropertyAll(buttonShape),
        elevation: const WidgetStatePropertyAll(0),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        side: WidgetStatePropertyAll(BorderSide(color: c.border)),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? c.textMuted
              : c.textPrimary,
        ),
        overlayColor: WidgetStatePropertyAll(ripple),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: ButtonStyle(
        textStyle: WidgetStatePropertyAll(t.callout),
        minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
        shape: WidgetStatePropertyAll(buttonShape),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? c.textMuted
              : c.textPrimary,
        ),
        overlayColor: WidgetStatePropertyAll(ripple),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStatePropertyAll(c.iconPrimary),
        overlayColor: WidgetStatePropertyAll(ripple),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(r.large),
      ),
      titleTextStyle: t.title3.copyWith(color: c.textPrimary),
      contentTextStyle: t.callout.copyWith(color: c.textNeutral),
      barrierColor: c.scrim,
      actionsPadding: EdgeInsets.fromLTRB(s.xl, 0, s.xl, s.lg),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: c.surfaceElevated,
      modalBarrierColor: c.scrim,
      elevation: 0,
      showDragHandle: true,
      dragHandleColor: c.textPrimary.withValues(alpha: 0.18),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(r.sheet)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: const WidgetStatePropertyAll(Colors.white),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return c.actionPrimary.withValues(alpha: 0.12);
        }
        return states.contains(WidgetState.selected)
            ? c.actionPrimary
            : c.textPrimary.withValues(alpha: 0.18);
      }),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      overlayColor: noOverlay,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? c.actionPrimary
            : Colors.transparent,
      ),
      checkColor: const WidgetStatePropertyAll(Color(0xFFF7F4EE)),
      side: BorderSide(color: c.textPrimary.withValues(alpha: 0.22)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.inputBackground,
      hintStyle: t.body.copyWith(color: c.textInactive),
      contentPadding: EdgeInsets.all(s.lg),
      border: _inputBorder(r, c.border),
      enabledBorder: _inputBorder(r, c.border),
      disabledBorder: _inputBorder(r, c.border),
      focusedBorder: _inputBorder(r, c.actionPrimary),
      errorBorder: _inputBorder(r, c.error),
      focusedErrorBorder: _inputBorder(r, c.error),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: c.inputCursor,
      selectionColor: c.inputCursor.withValues(alpha: 0.25),
      selectionHandleColor: c.inputCursor,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.actionPrimary,
      circularTrackColor: Colors.transparent,
      linearTrackColor: c.calendarCell,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.actionPrimary,
      contentTextStyle: t.subheadline.copyWith(color: c.onActionPrimary),
      behavior: SnackBarBehavior.floating,
      shape: const StadiumBorder(),
    ),
    listTileTheme: ListTileThemeData(
      textColor: c.textPrimary,
      iconColor: c.iconPrimary,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: c.actionPrimary,
        borderRadius: r.buttonShape,
      ),
      textStyle: t.footnote.copyWith(color: c.onActionPrimary),
    ),
  );
}

// 원본 버튼 세로 패딩 17(screens-a §1.1).
const double _buttonVerticalPadding = 17;

OutlineInputBorder _inputBorder(ChalkakRadius r, Color color) =>
    OutlineInputBorder(
      borderRadius: r.inputShape,
      borderSide: BorderSide(color: color),
    );

/// 라이트 고정이라 상태 표시줄 아이콘은 항상 어둡게 한다.
const SystemUiOverlayStyle chalkakSystemOverlayStyle = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light,
  systemNavigationBarColor: Colors.transparent,
  systemNavigationBarIconBrightness: Brightness.dark,
);
