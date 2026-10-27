import '../domain/kakao_sdk_gateway.dart';
import '../domain/social_login_client.dart';

/// 톡 우선, 계정 폴백, 취소 처리(REQ-AUTH-005~008).
/// - 톡 설치 확인이 true면 톡 로그인, false·확인 예외면 계정 로그인.
/// - 톡 로그인이 취소가 아닌 이유로 실패하면 계정 로그인으로 폴백, 취소면 폴백 없이 취소.
/// - idToken이 null·빈 문자열이면 [SocialLoginMissingIdTokenException].
class KakaoSocialLoginClient implements SocialLoginClient {
  KakaoSocialLoginClient({required KakaoSdkGateway sdk});

  @override
  Future<String> requestIdToken({required String nonce}) =>
      throw UnimplementedError();
}
