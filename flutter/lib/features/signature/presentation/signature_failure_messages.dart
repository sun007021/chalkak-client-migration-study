import '../domain/signature_failure.dart';

/// 실패 종류를 사용자 문구로 바꾼다(문구는 `Copy.*`). 모드마다 표가 다르다.
class SignatureFailureMessages {
  const SignatureFailureMessages._();

  /// 가입(REQ-ONB-023~026): network `sign.error.network`, expired `sign.error.expired`,
  /// forbidden 서버 message(없으면 generic), invalid `sign.error.invalid`,
  /// reupload·notFound `onb.signup.error.reupload`, timeout `onb.signup.error.timeout`,
  /// generic `onb.signup.error.generic`.
  static String signUp(SignatureFailure failure) => throw UnimplementedError();

  /// 변경(REQ-SIGN-024~028): network `sign.error.network`, expired `sign.error.expired`,
  /// forbidden `auth.banned.signature`, invalid `sign.error.invalid`,
  /// reupload `onb.signup.error.reupload`, notFound `sign.change.error.not-found`,
  /// generic·timeout `sign.change.error.generic`.
  static String change(SignatureFailure failure) => throw UnimplementedError();
}
