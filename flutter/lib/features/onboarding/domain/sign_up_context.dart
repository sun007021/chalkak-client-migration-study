import '../../auth/domain/signup_credentials.dart';

/// 로그인 시도 1회의 idToken·rawNonce 쌍을 가입이 끝날 때까지 메모리에만 둔다(TC-ONB-046).
/// 새 로그인 시도가 [begin]하면 이전 쌍을 교체하고, 가입 완료·뒤로 가기·401에서 [discard]한다.
class SignUpContext {
  SignUpContext();

  /// 없으면 null(가입 컨텍스트 소실 -> 로그인 화면).
  SignUpCredentials? get current => throw UnimplementedError();

  void begin(SignUpCredentials credentials) => throw UnimplementedError();

  void discard() => throw UnimplementedError();
}
