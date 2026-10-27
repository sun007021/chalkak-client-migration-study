import 'package:flutter/services.dart';

import '../constants/app_constants.dart';
import '../copy/ko.g.dart';

/// 유니코드 code point 수(grapheme·UTF-16 길이 아님).
int codePointLength(String text) => text.runes.length;

/// 앞뒤 공백 제거 후 code point 수.
int strippedCodePointLength(String text) => codePointLength(text.trim());

/// 게시물 제목 규칙(D-01).
abstract final class PostTitle {
  /// strip한 값. 비거나 공백뿐이면 null(요청에는 `title: null`).
  static String? normalize(String input) {
    final stripped = input.trim();
    return stripped.isEmpty ? null : stripped;
  }

  /// strip 후 10 code point 이하인가.
  static bool isWithinLimit(String input) =>
      strippedCodePointLength(input) <= AppConstants.postTitleMax;

  /// 표시용: null·빈 값이면 '무제'.
  static String display(String? title) =>
      normalize(title ?? '') ?? Copy.feedEditUntitled;

  /// 입력 변경 처리. 한 글자씩 입력해 한도를 넘으면 [previous] 유지,
  /// 한꺼번에 들어온 붙여넣기는 strip 후 10 code point까지 앞에서 자른다.
  ///
  /// [replaced]는 이번 편집으로 덮어쓴 선택 영역의 code point 수다. 선택 영역을
  /// 바꿔 붙여넣으면 전체 길이 증가가 1 이하여도 입력된 글자는 여러 개일 수 있다.
  static String applyInput({
    required String previous,
    required String next,
    int replaced = 0,
  }) {
    if (isWithinLimit(next)) return next;
    final inserted =
        codePointLength(next) - (codePointLength(previous) - replaced);
    if (inserted <= 1) return previous;
    final kept = next.trim().runes.take(AppConstants.postTitleMax);
    return String.fromCharCodes(kept);
  }
}

/// [PostTitle.applyInput]을 TextField에 연결하는 포매터.
class PostTitleInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final selection = oldValue.selection;
    final replaced = selection.isValid && !selection.isCollapsed
        ? codePointLength(selection.textInside(oldValue.text))
        : 0;
    final text = PostTitle.applyInput(
      previous: oldValue.text,
      next: newValue.text,
      replaced: replaced,
    );
    if (text == newValue.text) return newValue;
    if (text == oldValue.text) return oldValue;
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
