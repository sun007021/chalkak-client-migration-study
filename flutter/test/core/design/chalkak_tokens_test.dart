import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/design/chalkak_theme.dart';
import 'package:chalkak/core/design/chalkak_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// `#RRGGBB`, `rgba(r,g,b,a)` 문자열을 [Color]로 바꾼다.
Color _parse(String value) {
  if (value.startsWith('#')) {
    return Color(0xFF000000 | int.parse(value.substring(1), radix: 16));
  }
  final m = RegExp(r'rgba\((\d+),(\d+),(\d+),([\d.]+)\)').firstMatch(value)!;
  return Color.fromRGBO(
    int.parse(m[1]!),
    int.parse(m[2]!),
    int.parse(m[3]!),
    double.parse(m[4]!),
  );
}

void main() {
  final tokens = jsonDecode(
    File('../shared/design/tokens.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final color = tokens['color'] as Map<String, dynamic>;
  final styles =
      (tokens['font'] as Map<String, dynamic>)['styles']
          as Map<String, dynamic>;
  const t = ChalkakTokens();

  test('색 토큰이 shared/design/tokens.json과 같다', () {
    final actual = <String, Color>{
      'background': t.colors.background,
      'surface': t.colors.surface,
      'surfaceElevated': t.colors.surfaceElevated,
      'inputBackground': t.colors.inputBackground,
      'bottomBar': t.colors.bottomBar,
      'textPrimary': t.colors.textPrimary,
      'textSecondary': t.colors.textSecondary,
      'textMuted': t.colors.textMuted,
      'textInactive': t.colors.textInactive,
      'textNeutral': t.colors.textNeutral,
      'textOnImage': t.colors.textOnImage,
      'border': t.colors.border,
      'divider': t.colors.divider,
      'inputCursor': t.colors.inputCursor,
      'accent': t.colors.accent,
      'actionPrimary': t.colors.actionPrimary,
      'onActionPrimary': t.colors.onActionPrimary,
      'actionSecondary': t.colors.actionSecondary,
      'onActionSecondary': t.colors.onActionSecondary,
      'photoActionText': t.colors.photoActionText,
      'iconPrimary': t.colors.iconPrimary,
      'iconSecondary': t.colors.iconSecondary,
      'scrim': t.colors.scrim,
      'error': t.colors.error,
      'destructive': t.colors.destructive,
      'calendarCell': t.colors.calendarCell,
      'calendarCellBorder': t.colors.calendarCellBorder,
      'calendarSelection': t.colors.calendarSelection,
      'skeletonBase': t.colors.skeletonBase,
      'skeletonHighlight': t.colors.skeletonHighlight,
      'logoBackground': t.colors.logoBackground,
      'editorBackground': t.colors.editorBackground,
      'editorContent': t.colors.editorContent,
      'editorContentMuted': t.colors.editorContentMuted,
      'editorScrim': t.colors.editorScrim,
    };
    expect(actual.keys.toSet(), color.keys.toSet(), reason: '토큰 이름 목록');
    for (final entry in actual.entries) {
      final expected = _parse(color[entry.key] as String);
      expect(entry.value.toARGB32(), expected.toARGB32(), reason: entry.key);
    }
  });

  test('간격·라운드 토큰이 tokens.json과 같다', () {
    final spacing = tokens['spacing'] as Map<String, dynamic>;
    expect(t.spacing.none, spacing['none']);
    expect(t.spacing.xs, spacing['xs']);
    expect(t.spacing.sm, spacing['sm']);
    expect(t.spacing.md, spacing['md']);
    expect(t.spacing.lg, spacing['lg']);
    expect(t.spacing.xl, spacing['xl']);
    expect(t.spacing.xxl, spacing['xxl']);
    expect(t.spacing.screenHorizontal, spacing['screenHorizontal']);
    final radius = tokens['radius'] as Map<String, dynamic>;
    expect(t.radius.small, radius['small']);
    expect(t.radius.button, radius['button']);
    expect(t.radius.input, radius['input']);
    expect(t.radius.photoCard, radius['photoCard']);
    expect(t.radius.large, radius['large']);
    expect(t.radius.xlarge, radius['xlarge']);
    expect(t.radius.sheet, radius['sheet']);
    expect(t.radius.pill, radius['pill']);
  });

  test('타이포 토큰(크기·행간·굵기·글꼴)이 tokens.json과 같다', () {
    final actual = <String, TextStyle>{
      'display': t.text.display,
      'title1': t.text.title1,
      'title2': t.text.title2,
      'title3': t.text.title3,
      'headline': t.text.headline,
      'body': t.text.body,
      'callout': t.text.callout,
      'subheadline': t.text.subheadline,
      'footnote': t.text.footnote,
      'caption': t.text.caption,
      'brand': t.text.brand,
      'handwriting': t.text.handwriting,
      'photoCardTitle': t.text.photoCardTitle,
    };
    expect(actual.keys.toSet(), styles.keys.toSet());
    for (final entry in actual.entries) {
      final spec = styles[entry.key] as Map<String, dynamic>;
      final style = entry.value;
      expect(
        style.fontSize,
        (spec['size'] as num).toDouble(),
        reason: entry.key,
      );
      expect(
        style.height! * style.fontSize!,
        closeTo((spec['lineHeight'] as num).toDouble(), 1e-9),
        reason: entry.key,
      );
      expect(
        style.fontWeight!.value,
        spec['weight'],
        reason: '${entry.key} weight',
      );
      expect(
        style.letterSpacing ?? 0,
        (spec['letterSpacing'] as num?)?.toDouble() ?? 0,
        reason: '${entry.key} letterSpacing',
      );
      final family = switch (spec['family']) {
        'pretendard' => ChalkakFonts.pretendard,
        'brand' => ChalkakFonts.brand,
        _ => ChalkakFonts.handwriting,
      };
      expect(style.fontFamily, family, reason: '${entry.key} family');
    }
  });

  test('글꼴 파일이 shared/design/fonts와 같다', () {
    final dir = Directory('assets/fonts');
    final shared = Directory('../shared/design/fonts');
    final names = shared.listSync().map((e) => e.uri.pathSegments.last).toSet();
    expect(dir.listSync().map((e) => e.uri.pathSegments.last).toSet(), names);
    for (final name in names) {
      expect(
        File('assets/fonts/$name').readAsBytesSync().length,
        File('../shared/design/fonts/$name').readAsBytesSync().length,
        reason: name,
      );
    }
    final pubspec = File('pubspec.yaml').readAsStringSync();
    for (final name in names) {
      expect(pubspec, contains('assets/fonts/$name'), reason: name);
    }
  });

  test('아이콘 에셋이 shared/design/icons와 같다', () {
    final shared = Directory('../shared/design/icons')
        .listSync()
        .whereType<File>()
        .map((e) => e.uri.pathSegments.last)
        .toList();
    for (final name in shared) {
      expect(
        File('assets/icons/$name').readAsStringSync(),
        File('../shared/design/icons/$name').readAsStringSync(),
        reason: name,
      );
    }
  });

  testWidgets('테마가 토큰을 적용한다: 보라/시스템 글꼴 없이 라이트 고정', (tester) async {
    final theme = buildChalkakTheme();
    expect(theme.brightness, Brightness.light);
    expect(theme.colorScheme.primary, t.colors.actionPrimary);
    expect(theme.colorScheme.surface, t.colors.background);
    expect(theme.colorScheme.surfaceTint, const Color(0x00000000));
    expect(theme.scaffoldBackgroundColor, t.colors.background);
    expect(theme.textTheme.bodyMedium!.fontFamily, ChalkakFonts.pretendard);
    expect(theme.extension<ChalkakTokens>(), isNotNull);

    // 시스템이 다크여도 같은 토큰 테마가 쓰인다.
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearAllTestValues);
    late BuildContext captured;
    await tester.pumpWidget(
      MaterialApp(
        theme: theme,
        darkTheme: theme,
        themeMode: ThemeMode.light,
        home: Scaffold(
          body: Builder(
            builder: (context) {
              captured = context;
              return FilledButton(onPressed: () {}, child: const Text('확인'));
            },
          ),
        ),
      ),
    );
    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.backgroundColor, isNull);
    expect(Theme.of(captured).scaffoldBackgroundColor, t.colors.background);
    expect(captured.tokens.colors.actionPrimary, const Color(0xFF2B2724));

    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    final style = button.style ?? Theme.of(captured).filledButtonTheme.style!;
    expect(
      style.backgroundColor!.resolve(<WidgetState>{}),
      t.colors.actionPrimary,
    );
    expect(
      style.backgroundColor!.resolve({WidgetState.disabled}),
      t.colors.actionPrimary.withValues(alpha: 0.12),
    );
  });
}
