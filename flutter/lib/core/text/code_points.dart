import 'package:flutter/services.dart';

/// 유니코드 code point 수(grapheme·UTF-16 길이 아님).
int codePointLength(String text) => throw UnimplementedError();

/// 앞뒤 공백 제거 후 code point 수.
int strippedCodePointLength(String text) => throw UnimplementedError();

/// 게시물 제목 규칙(D-01).
abstract final class PostTitle {
  /// strip한 값. 비거나 공백뿐이면 null(요청에는 `title: null`).
  static String? normalize(String input) => throw UnimplementedError();

  /// strip 후 10 code point 이하인가.
  static bool isWithinLimit(String input) => throw UnimplementedError();

  /// 표시용: null·빈 값이면 '무제'.
  static String display(String? title) => throw UnimplementedError();

  /// 입력 변경 처리. 한 글자씩 입력해 한도를 넘으면 [previous] 유지,
  /// 한꺼번에 들어온 붙여넣기는 strip 후 10 code point까지 앞에서 자른다.
  static String applyInput({required String previous, required String next}) =>
      throw UnimplementedError();
}

/// [PostTitle.applyInput]을 TextField에 연결하는 포매터.
class PostTitleInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) => throw UnimplementedError();
}
