import 'package:flutter/material.dart';

/// 디자인 토큰. 값의 기준은 `shared/design/tokens.json`이며
/// `test/core/design/chalkak_tokens_test.dart`가 같은 값인지 대조한다(docs/design/README.md §2).
/// 화면 코드는 수치·색을 직접 쓰지 않고 `context.tokens`로 이 토큰만 쓴다.
@immutable
class ChalkakTokens extends ThemeExtension<ChalkakTokens> {
  const ChalkakTokens({
    this.colors = const ChalkakColors(),
    this.text = const ChalkakTypography(),
    this.spacing = const ChalkakSpacing(),
    this.radius = const ChalkakRadius(),
  });

  final ChalkakColors colors;
  final ChalkakTypography text;
  final ChalkakSpacing spacing;
  final ChalkakRadius radius;

  /// 라이트 고정이라 보간할 값이 없다.
  @override
  ChalkakTokens copyWith() => this;

  @override
  ChalkakTokens lerp(ThemeExtension<ChalkakTokens>? other, double t) => this;
}

/// 색. tokens.json의 `color`.
@immutable
class ChalkakColors {
  const ChalkakColors();

  final Color background = const Color(0xFFF7F6F3);
  final Color surface = const Color(0xFFF7F6F3);
  final Color surfaceElevated = const Color(0xFFFFFFFF);
  final Color inputBackground = const Color(0xFFFCFAF6);
  final Color bottomBar = const Color(0xFF8C8479);
  final Color textPrimary = const Color(0xFF2B2724);
  final Color textSecondary = const Color.fromRGBO(43, 39, 36, 0.68);
  final Color textMuted = const Color.fromRGBO(43, 39, 36, 0.48);
  final Color textInactive = const Color(0xFF9A968D);
  final Color textNeutral = const Color(0xFF6B7280);
  final Color textOnImage = const Color(0xFFFFFFFF);
  final Color border = const Color.fromRGBO(136, 136, 136, 0.15);
  final Color divider = const Color(0xFF757575);
  final Color inputCursor = const Color(0xFFB0563B);
  final Color accent = const Color(0xFFB0563B);
  final Color actionPrimary = const Color(0xFF2B2724);
  final Color onActionPrimary = const Color(0xFFFFFFFF);
  final Color actionSecondary = const Color(0xFF808080);
  final Color onActionSecondary = const Color(0xFFFFFFFF);
  final Color photoActionText = const Color(0xFF7D7D7D);
  final Color iconPrimary = const Color(0xFF2B2724);
  final Color iconSecondary = const Color.fromRGBO(43, 39, 36, 0.62);
  final Color scrim = const Color.fromRGBO(0, 0, 0, 0.40);
  final Color error = const Color(0xFFBA1A1A);
  final Color destructive = const Color(0xFFFF5A5F);
  final Color calendarCell = const Color(0xFFEAE7DE);
  final Color calendarCellBorder = const Color(0xFFDCD8CE);
  final Color calendarSelection = const Color(0xFFB0563B);
  final Color skeletonBase = const Color(0xFFEAE7DE);
  final Color skeletonHighlight = const Color(0xFFF7F6F3);
  final Color logoBackground = const Color(0xFFFFFAF6);
  final Color editorBackground = const Color(0xFF141312);
  final Color editorContent = const Color(0xFFFFFFFF);
  final Color editorContentMuted = const Color.fromRGBO(255, 255, 255, 0.56);
  final Color editorScrim = const Color.fromRGBO(20, 19, 18, 0.62);
}

/// 간격. tokens.json의 `spacing`.
@immutable
class ChalkakSpacing {
  const ChalkakSpacing();

  final double none = 0;
  final double xs = 4;
  final double sm = 8;
  final double md = 12;
  final double lg = 16;
  final double xl = 24;
  final double xxl = 40;
  final double screenHorizontal = 25;
}

/// 라운드. tokens.json의 `radius`. [pill]은 캡슐(충분히 큰 값)이다.
@immutable
class ChalkakRadius {
  const ChalkakRadius();

  final double small = 7;
  final double button = 12;
  final double input = 14;
  final double photoCard = 12;
  final double large = 16;
  final double xlarge = 18;
  final double sheet = 28;
  final double pill = 9999;

  BorderRadius get buttonShape => BorderRadius.circular(button);
  BorderRadius get inputShape => BorderRadius.circular(input);
  BorderRadius get pillShape => BorderRadius.circular(pill);
}

/// 글꼴 패밀리 이름(pubspec `fonts:`와 같다).
abstract final class ChalkakFonts {
  static const pretendard = 'Pretendard';
  static const brand = 'Continuous';
  static const handwriting = 'GriunXHangeulBanguri';
}

/// 타이포그래피. tokens.json의 `font.styles`.
/// 행간은 `height = lineHeight / size`로 옮긴다. 색은 넣지 않는다(쓰는 곳에서 `copyWith`).
@immutable
class ChalkakTypography {
  const ChalkakTypography();

  TextStyle get display => _pretendard(700, 32, 41);
  TextStyle get title1 => _pretendard(700, 28, 34);
  TextStyle get title2 => _pretendard(700, 24, 28);
  TextStyle get title3 => _pretendard(600, 20, 25);
  TextStyle get headline => _pretendard(600, 18, 22);
  TextStyle get body => _pretendard(400, 17, 22);
  TextStyle get callout => _pretendard(400, 16, 21);
  TextStyle get subheadline => _pretendard(400, 14, 20);
  TextStyle get footnote => _pretendard(400, 13, 18);
  TextStyle get caption => _pretendard(400, 12, 16);
  TextStyle get brand => const TextStyle(
    fontFamily: ChalkakFonts.brand,
    fontWeight: FontWeight.w400,
    fontSize: 30,
    height: 36 / 30,
    letterSpacing: -0.42,
  );
  TextStyle get handwriting => const TextStyle(
    fontFamily: ChalkakFonts.handwriting,
    fontWeight: FontWeight.w400,
    fontSize: 20,
    height: 17 / 20,
  );
  TextStyle get photoCardTitle => const TextStyle(
    fontFamily: ChalkakFonts.handwriting,
    fontWeight: FontWeight.w400,
    fontSize: 19,
    height: 22 / 19,
  );

  static TextStyle _pretendard(int weight, double size, double lineHeight) =>
      TextStyle(
        fontFamily: ChalkakFonts.pretendard,
        fontWeight: FontWeight.values[weight ~/ 100 - 1],
        fontSize: size,
        height: lineHeight / size,
      );
}

extension ChalkakTokensContext on BuildContext {
  /// 테마에 달린 [ChalkakTokens]. 테마가 없는 테스트에서도 같은 값을 돌려준다.
  ChalkakTokens get tokens =>
      Theme.of(this).extension<ChalkakTokens>() ?? const ChalkakTokens();
}
