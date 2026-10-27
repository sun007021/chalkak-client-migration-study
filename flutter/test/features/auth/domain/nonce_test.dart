import 'dart:convert';
import 'dart:math';

import 'package:chalkak/features/auth/domain/nonce.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-AUTH-002 100회 생성하면 매번 다르고 43자 base64url(패딩 없음)이다', () {
    final gen = SecureNonceGenerator(random: Random(7));
    final seen = <String>{};
    final shape = RegExp(r'^[A-Za-z0-9_-]{43}$');
    for (var i = 0; i < 100; i++) {
      final n = gen.generate();
      expect(n, matches(shape));
      expect(n, isNot(contains('=')));
      seen.add(n);
    }
    expect(seen, hasLength(100));
  });

  test('TC-AUTH-002 32바이트 난수를 base64url로 인코딩한다(디코딩하면 32바이트)', () {
    final n = SecureNonceGenerator(random: Random(1)).generate();
    final padded = n + '=' * ((4 - n.length % 4) % 4);
    expect(base64Url.decode(padded), hasLength(32));
  });

  test('TC-AUTH-002 같은 시드의 Random이면 같은 값(난수는 주입받는다)', () {
    expect(
      SecureNonceGenerator(random: Random(3)).generate(),
      SecureNonceGenerator(random: Random(3)).generate(),
    );
  });

  test('TC-AUTH-003 SHA-256 소문자 hex 64자: "abc"의 표준 벡터', () {
    expect(
      Nonce.sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('TC-AUTH-003 빈 문자열과 한글(UTF-8)도 같은 규칙이다', () {
    expect(
      Nonce.sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(Nonce.sha256Hex('찰칵'), matches(RegExp(r'^[0-9a-f]{64}$')));
  });

  test('TC-AUTH-003 원문과 해시는 서로 다르다', () {
    final raw = SecureNonceGenerator(random: Random(9)).generate();
    final hashed = Nonce.sha256Hex(raw);
    expect(hashed, hasLength(64));
    expect(hashed, isNot(raw));
  });
}
