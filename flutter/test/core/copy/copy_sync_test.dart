import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../tool/gen_copy.dart';
import '../../support/fixtures.dart';

void main() {
  final jsonFile = File('${Fixture.root.path}/../copy/ko.json');
  final copy = (jsonDecode(jsonFile.readAsStringSync()) as Map)
      .cast<String, String>();

  test('생성 파일이 ko.json과 같다 (dart run tool/gen_copy.dart)', () {
    final current = File('lib/core/copy/ko.g.dart').readAsStringSync();
    expect(current, generateCopySource(jsonFile.readAsStringSync()));
  });

  test('키 수와 const 수가 같다', () {
    final source = File('lib/core/copy/ko.g.dart').readAsStringSync();
    expect(RegExp(r'static const ').allMatches(source), hasLength(copy.length));
  });

  test('키 이름 규칙: . 와 - 를 lowerCamel로', () {
    expect(keyToIdentifier('ai.card.completed'), 'aiCardCompleted');
    expect(keyToIdentifier('ai.error.not-viewable'), 'aiErrorNotViewable');
    expect(Copy.aiCardCompleted, copy['ai.card.completed']);
    expect(Copy.aiErrorNotViewable, copy['ai.error.not-viewable']);
  });

  test('식별자 충돌은 생성 실패', () {
    expect(
      () => generateCopySource('{"a.b-c":"x","a-b.c":"y"}'),
      throwsStateError,
    );
  });

  test('특수 문자(달러, 따옴표, 역슬래시, 줄바꿈)를 이스케이프한다', () {
    const json =
        r'{"x.y":"a$b '
        r"'q' "
        r'\\ \n"}';
    final source = generateCopySource(json);
    expect(source, contains(r"static const xY = 'a\$b \'q\' \\ \n';"));
  });

  group('fill', () {
    test('플레이스홀더를 치환한다', () {
      expect(Copy.fill('오늘의 주제는 {주제}', {'주제': '가을 하늘'}), '오늘의 주제는 가을 하늘');
    });

    test('같은 이름이 여러 번 있어도 모두 치환', () {
      expect(Copy.fill('{a}-{a}', {'a': '1'}), '1-1');
    });

    test('값이 없는 플레이스홀더는 그대로', () {
      expect(Copy.fill('{a} {b}', {'a': '1'}), '1 {b}');
    });
  });
}
