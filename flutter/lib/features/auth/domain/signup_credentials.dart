/// SIGN_UP_REQUIRED 뒤 가입 완료까지 메모리에만 두는 값(REQ-AUTH-004).
/// 디스크 저장과 로그 출력 금지: [toString]은 값을 드러내지 않는다.
class SignUpCredentials {
  const SignUpCredentials({required this.idToken, required this.rawNonce});

  final String idToken;
  final String rawNonce;

  @override
  String toString() => 'SignUpCredentials(***)';
}
