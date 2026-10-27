import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

abstract interface class NonceGenerator {
  /// 보안 난수 32바이트를 base64url(패딩 없음)로 인코딩한 43자 문자열. 호출마다 새 값.
  String generate();
}

class SecureNonceGenerator implements NonceGenerator {
  SecureNonceGenerator({required this._random});

  final Random _random;

  @override
  String generate() {
    final bytes = List<int>.generate(32, (_) => _random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }
}

abstract final class Nonce {
  /// SDK에 전달할 값: SHA-256(UTF-8 [rawNonce])의 소문자 16진수 64자.
  static String sha256Hex(String rawNonce) =>
      sha256.convert(utf8.encode(rawNonce)).toString();
}
