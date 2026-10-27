import '../../../core/network/api_error.dart';

enum LoginFailureKind {
  /// idToken 없음 -> `auth.login.error.config`
  config,

  /// SDK 일반 실패 -> `auth.login.error.kakao-failed`
  kakaoFailed,

  /// 401 UNAUTHORIZED -> `auth.login.error.kakao-account`
  kakaoAccount,

  /// 연결 실패·타임아웃 -> `auth.login.error.network`
  network,

  /// 해석 불가 응답 -> `auth.login.error.invalid-response`
  invalidResponse,

  /// 403 FORBIDDEN -> 서버 message 그대로([serverMessage]). message가 없으면 generic.
  forbidden,

  /// 그 밖의 서버 오류(500, 400, HTML 502 등) -> `auth.login.error.generic`
  generic,
}

class LoginFailure {
  const LoginFailure(this.kind, {this.serverMessage});

  /// social-login 응답 오류를 분류한다. cancelled는 호출자가 먼저 걸러야 한다.
  factory LoginFailure.fromApiError(ApiError error) =>
      throw UnimplementedError();

  final LoginFailureKind kind;
  final String? serverMessage;
}
