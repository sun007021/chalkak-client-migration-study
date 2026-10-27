import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../auth/domain/signup_credentials.dart';
import '../../signature/domain/signature_repository.dart';

class SignUpUploadTicket {
  const SignUpUploadTicket({required this.upload, required this.signupToken});

  final SignatureUploadTicket upload;

  /// 5분짜리 가입 토큰. 확정 호출에만 쓰고 로그에 남기지 않는다.
  final String signupToken;
}

/// 가입 API. 오류는 [ApiError]로 던진다.
abstract interface class SignUpRepository {
  /// `POST /auth/social-signup/signature/uploads {provider:"KAKAO", idToken, rawNonce}`.
  /// authorizationCode 키·Authorization 헤더 없음, 자동 재시도 없음.
  Future<SignUpUploadTicket> requestUpload(
    SignUpCredentials credentials, {
    CancelToken? cancelToken,
  });

  /// `POST /auth/social-signup {signupToken}`. 200이면 `clock.now()` + 응답 초로 만료 시각을
  /// 계산한 Session(isGuest=false)을 돌려준다. 자동 재시도 없음. 저장은 호출자 몫.
  /// 필수 필드가 없으면 invalidResponse.
  Future<Session> signUp(String signupToken, {CancelToken? cancelToken});
}
