import 'package:chalkak/core/copy/ko.dart';
import 'package:chalkak/core/text/code_points.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const family = '👨‍👩‍👧'; // 5 code point, 1 grapheme
final tenEmoji = '😀' * 10; // 10 code point, UTF-16 20

TextEditingValue v(String t) => TextEditingValue(
  text: t,
  selection: TextSelection.collapsed(offset: t.length),
);

void main() {
  group('codePointLength', () {
    test('TC-FEED-020 TC-UPL-081 결합 이모지는 grapheme가 아니라 code point로 센다', () {
      expect(codePointLength(family), 5);
      expect(codePointLength('😀'), 1);
      expect(codePointLength('가나다'), 3);
      expect(codePointLength(''), 0);
    });

    test('TC-FEED-019 TC-UPL-080 UTF-16 길이가 아니라 code point', () {
      expect(tenEmoji.length, 20);
      expect(codePointLength(tenEmoji), 10);
    });

    test('TC-FDBK-010 결합 이모지 200개=1000, 201개=1005 (길이 계산 부분)', () {
      expect(codePointLength(family * 200), 1000);
      expect(codePointLength(family * 201), 1005);
    });

    test('strippedCodePointLength는 앞뒤 공백을 제외한다', () {
      expect(strippedCodePointLength('  가나  '), 2);
      expect(strippedCodePointLength('   '), 0);
    });
  });

  group('PostTitle.normalize / isWithinLimit', () {
    test('TC-FEED-021 TC-UPL-082 앞뒤 공백 12자는 strip 후 10자로 허용, 전송값은 공백 제거', () {
      const input = ' 가나다라마바사아자차 ';
      expect(input.length, 12);
      expect(PostTitle.isWithinLimit(input), isTrue);
      expect(PostTitle.normalize(input), '가나다라마바사아자차');
    });

    test('TC-FEED-022 TC-UPL-082 빈 입력·공백만은 null', () {
      expect(PostTitle.normalize(''), isNull);
      expect(PostTitle.normalize('   '), isNull);
      expect(PostTitle.normalize('\t\n '), isNull);
    });

    test('TC-UPL-080 한글 10자·이모지 10개 허용, 11개는 초과', () {
      expect(PostTitle.isWithinLimit('가나다라마바사아자차'), isTrue);
      expect(PostTitle.isWithinLimit(tenEmoji), isTrue);
      expect(PostTitle.isWithinLimit('$tenEmoji😀'), isFalse);
    });

    test('TC-FEED-020 TC-UPL-081 결합 이모지 2개(10) 허용, +1자는 11 초과', () {
      expect(PostTitle.isWithinLimit(family * 2), isTrue);
      expect(PostTitle.isWithinLimit('${family * 2}가'), isFalse);
    });
  });

  group('PostTitle.display', () {
    test('TC-FEED-013 TC-FEED-053 null·빈 값은 무제', () {
      expect(PostTitle.display(null), Ko.untitled);
      expect(PostTitle.display(''), '무제');
      expect(PostTitle.display('  '), '무제');
      expect(PostTitle.display('안녕'), '안녕');
    });
  });

  group('PostTitle.applyInput', () {
    test('TC-FEED-019 TC-UPL-080 11번째 이모지 입력은 들어가지 않는다', () {
      expect(
        PostTitle.applyInput(previous: tenEmoji, next: '$tenEmoji😀'),
        tenEmoji,
      );
    });

    test('TC-FEED-020 TC-UPL-081 결합 이모지 2개 뒤 한 글자 입력은 막힌다', () {
      final prev = family * 2;
      expect(PostTitle.applyInput(previous: prev, next: '$prev가'), prev);
    });

    test('TC-FEED-020 TC-UPL-081 11자 붙여넣기는 10 code point까지만', () {
      expect(
        PostTitle.applyInput(previous: '', next: '가나다라마바사아자차카'),
        '가나다라마바사아자차',
      );
      expect(PostTitle.applyInput(previous: '', next: '$tenEmoji😀'), tenEmoji);
    });

    test('TC-FEED-020 결합 이모지를 중간에서 자르지 않고 code point 경계로 자른다', () {
      final out = PostTitle.applyInput(previous: '', next: family * 3);
      expect(codePointLength(out), 10);
      expect(out, family * 2);
    });

    test('TC-FEED-021 앞뒤 공백은 한도에 포함하지 않는다', () {
      expect(
        PostTitle.applyInput(previous: '', next: ' 가나다라마바사아자차 '),
        ' 가나다라마바사아자차 ',
      );
    });

    test('한도 이내 입력은 그대로 통과하고 삭제는 항상 허용', () {
      expect(PostTitle.applyInput(previous: '가', next: '가나'), '가나');
      expect(PostTitle.applyInput(previous: tenEmoji, next: '😀'), '😀');
    });
  });

  group('PostTitleInputFormatter', () {
    test('TC-FEED-019 TC-UPL-080 11번째 입력은 이전 값 유지', () {
      final result = PostTitleInputFormatter().formatEditUpdate(
        v(tenEmoji),
        v('$tenEmoji😀'),
      );
      expect(result.text, tenEmoji);
    });

    test('TC-FEED-020 TC-UPL-081 붙여넣기는 10 code point까지, 커서는 끝', () {
      final result = PostTitleInputFormatter().formatEditUpdate(
        v(''),
        v('가나다라마바사아자차카타'),
      );
      expect(result.text, '가나다라마바사아자차');
      expect(result.selection.baseOffset, result.text.length);
    });
  });
}
