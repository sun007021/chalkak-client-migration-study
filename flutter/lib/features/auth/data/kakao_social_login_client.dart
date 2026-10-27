import '../domain/kakao_sdk_gateway.dart';
import '../domain/social_login_client.dart';

/// 톡 우선, 계정 폴백, 취소 처리(REQ-AUTH-005~008).
/// - 톡 설치 확인이 true면 톡 로그인, false·확인 예외면 계정 로그인.
/// - 톡 로그인이 취소가 아닌 이유로 실패하면 계정 로그인으로 폴백, 취소면 폴백 없이 취소.
/// - idToken이 null·빈 문자열이면 [SocialLoginMissingIdTokenException].
class KakaoSocialLoginClient implements SocialLoginClient {
  KakaoSocialLoginClient({required this._sdk});

  final KakaoSdkGateway _sdk;

  @override
  Future<String> requestIdToken({required String nonce}) async {
    String? idToken;
    try {
      idToken = await _login(nonce);
    } on KakaoSdkCancelledException {
      throw const SocialLoginCancelledException();
    } on Object catch (e) {
      throw SocialLoginFailedException(e);
    }
    if (idToken == null || idToken.isEmpty) {
      throw const SocialLoginMissingIdTokenException();
    }
    return idToken;
  }

  Future<String?> _login(String nonce) async {
    if (await _talkInstalled()) {
      try {
        return await _sdk.loginWithKakaoTalk(nonce: nonce);
      } on KakaoSdkCancelledException {
        rethrow;
      } on Object {
        // 톡 로그인 실패는 계정 로그인으로 폴백한다.
      }
    }
    return _sdk.loginWithKakaoAccount(nonce: nonce);
  }

  Future<bool> _talkInstalled() async {
    try {
      return await _sdk.isKakaoTalkInstalled();
    } on Object {
      return false;
    }
  }
}
