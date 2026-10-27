/// 소셜 SDK에서 idToken을 받는 경계. 카카오만 구현한다.
abstract interface class SocialLoginClient {
  /// [nonce]는 이미 SHA-256 소문자 hex로 바꾼 값이다.
  /// 취소는 [SocialLoginCancelledException], idToken 없는 성공은
  /// [SocialLoginMissingIdTokenException], 그 밖의 실패는 [SocialLoginFailedException].
  Future<String> requestIdToken({required String nonce});
}

class SocialLoginCancelledException implements Exception {
  const SocialLoginCancelledException();
}

class SocialLoginMissingIdTokenException implements Exception {
  const SocialLoginMissingIdTokenException();
}

class SocialLoginFailedException implements Exception {
  const SocialLoginFailedException([this.cause]);
  final Object? cause;
}
