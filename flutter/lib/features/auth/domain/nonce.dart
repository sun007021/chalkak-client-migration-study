import 'dart:math';

abstract interface class NonceGenerator {
  /// 보안 난수 32바이트를 base64url(패딩 없음)로 인코딩한 43자 문자열. 호출마다 새 값.
  String generate();
}

class SecureNonceGenerator implements NonceGenerator {
  SecureNonceGenerator({required Random random});

  @override
  String generate() => throw UnimplementedError();
}

abstract final class Nonce {
  /// SDK에 전달할 값: SHA-256(UTF-8 [rawNonce])의 소문자 16진수 64자.
  static String sha256Hex(String rawNonce) => throw UnimplementedError();
}
