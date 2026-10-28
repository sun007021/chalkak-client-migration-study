import 'package:chalkak/features/feedback/domain/feedback_content.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/feedback_fakes.dart' show familyEmoji, repeat;

void main() {
  group('공백만', () {
    for (final (name, raw) in [
      ('빈 문자열', ''),
      ('스페이스', '   '),
      ('탭', '\t\t'),
      ('개행', '\n\r\n'),
      ('전각 공백 U+3000', '　　'),
      ('섞인 공백', ' \t\n　 \n '),
    ]) {
      test('TC-FDBK-004 $name만이면 blank이고 길이는 0이다', () {
        expect(FeedbackContent.normalize(raw), isEmpty);
        expect(FeedbackContent.length(raw), 0);
        expect(FeedbackContent.validate(raw), FeedbackValidation.blank);
      });
    }
  });

  group('길이 경계', () {
    test('TC-FDBK-005 trim 후 1 code point는 valid다', () {
      expect(FeedbackContent.length('  a  '), 1);
      expect(FeedbackContent.validate('  a  '), FeedbackValidation.valid);
    });

    test('TC-FDBK-006 trim 후 정확히 1000 code point는 valid다', () {
      final raw = repeat('a', 1000);
      expect(FeedbackContent.length(raw), 1000);
      expect(FeedbackContent.validate(raw), FeedbackValidation.valid);
    });

    test('TC-FDBK-007 trim 후 1001 code point는 tooLong이다', () {
      final raw = repeat('a', 1001);
      expect(FeedbackContent.length(raw), 1001);
      expect(FeedbackContent.validate(raw), FeedbackValidation.tooLong);
    });

    test(
      'TC-FDBK-008 앞뒤 공백 포함 1002자라도 trim 후 1000자면 valid이고 보낼 값은 trim 값이다',
      () {
        final raw = ' ${repeat('a', 1000)} ';
        expect(raw.length, 1002);
        expect(FeedbackContent.validate(raw), FeedbackValidation.valid);
        expect(FeedbackContent.normalize(raw), repeat('a', 1000));
      },
    );

    test('TC-FDBK-009 이모지 1000개(UTF-16 2000)는 valid, 1001개는 tooLong이다', () {
      final ok = repeat('\u{1F600}', 1000);
      expect(ok.length, 2000);
      expect(FeedbackContent.length(ok), 1000);
      expect(FeedbackContent.validate(ok), FeedbackValidation.valid);
      expect(
        FeedbackContent.validate(repeat('\u{1F600}', 1001)),
        FeedbackValidation.tooLong,
      );
    });

    test('TC-FDBK-010 결합 이모지는 code point 5개로 센다(200개 valid, 201개 tooLong)', () {
      expect(FeedbackContent.length(familyEmoji), 5);
      expect(
        FeedbackContent.validate(repeat(familyEmoji, 200)),
        FeedbackValidation.valid,
      );
      expect(FeedbackContent.length(repeat(familyEmoji, 201)), 1005);
      expect(
        FeedbackContent.validate(repeat(familyEmoji, 201)),
        FeedbackValidation.tooLong,
      );
    });

    test('TC-FDBK-011 분해형·조합형 한글은 정규화하지 않고 code point 그대로 센다', () {
      const composed = '한';
      const decomposed = '한';
      expect(FeedbackContent.length(composed), 1);
      expect(FeedbackContent.length(decomposed), 3);
      expect(FeedbackContent.normalize(decomposed), decomposed);
    });
  });

  test('TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거한다', () {
    const raw = '  \n첫 줄  \n\n   둘째\t\t줄 　';
    expect(FeedbackContent.normalize(raw), '첫 줄  \n\n   둘째\t\t줄');
  });
}
