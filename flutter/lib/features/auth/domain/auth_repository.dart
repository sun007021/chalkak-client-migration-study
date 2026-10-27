import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';

sealed class SocialLoginResponse {
  const SocialLoginResponse();
}

/// LOGIN_SUCCESS. [session]은 만료 시각을 `clock.now()` + 응답 초로 계산한 값이고
/// isGuest=false다. 저장은 호출자 몫이다.
final class SocialLoginSucceeded extends SocialLoginResponse {
  const SocialLoginSucceeded(this.session);
  final Session session;
}

/// SIGN_UP_REQUIRED. 토큰 필드가 없어도 오류가 아니다.
final class SocialLoginSignUpRequired extends SocialLoginResponse {
  const SocialLoginSignUpRequired();
}

/// 인증 API. 오류는 [ApiError]로 던진다(해석할 수 없는 응답은 invalidResponse).
abstract interface class AuthRepository {
  /// `POST /auth/social-login {provider:"KAKAO", idToken, rawNonce}`.
  /// `authorizationCode` 키와 Authorization 헤더를 보내지 않고 자동 재시도하지 않는다.
  /// LOGIN_SUCCESS인데 토큰 필드가 없거나 알 수 없는 status면 invalidResponse.
  Future<SocialLoginResponse> socialLogin({
    required String idToken,
    required String rawNonce,
    CancelToken? cancelToken,
  });

  /// `POST /auth/logout {refreshToken}`. Authorization 없음, 재시도 없음, 204가 성공.
  Future<void> logout({required String refreshToken});

  /// `DELETE /users/me`(본문 없음). 204가 성공. 401은 ApiClient가 갱신 후 1회 재전송한다.
  Future<void> deleteAccount();
}
