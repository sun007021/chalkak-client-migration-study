import 'package:clock/clock.dart';
import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../../auth/domain/signup_credentials.dart';
import '../../signature/data/upload_ticket_json.dart';
import '../domain/sign_up_repository.dart';

class ApiSignUpRepository implements SignUpRepository {
  ApiSignUpRepository({required this._client});

  final ApiClient _client;

  @override
  Future<SignUpUploadTicket> requestUpload(
    SignUpCredentials credentials, {
    CancelToken? cancelToken,
  }) {
    // `/auth/**`라 Authorization이 붙지 않고, 이 POST는 자동 재시도 대상이 아니다.
    return _client.request<SignUpUploadTicket>(
      ApiRequest(
        HttpMethod.post,
        '/auth/social-signup/signature/uploads',
        body: {
          'provider': 'KAKAO',
          'idToken': credentials.idToken,
          'rawNonce': credentials.rawNonce,
        },
      ),
      decode: (json) {
        final map = json! as Map;
        return SignUpUploadTicket(
          upload: parseUploadTicket(map),
          signupToken: map['signupToken']! as String,
        );
      },
      cancelToken: cancelToken,
    );
  }

  @override
  Future<Session> signUp(String signupToken, {CancelToken? cancelToken}) {
    return _client.request<Session>(
      ApiRequest(
        HttpMethod.post,
        '/auth/social-signup',
        body: {'signupToken': signupToken},
      ),
      decode: (json) {
        final map = json! as Map;
        final now = clock.now();
        return Session(
          userId: map['userId']! as String,
          accessToken: map['accessToken']! as String,
          accessTokenExpiresAt: now.add(
            Duration(seconds: map['expiresIn']! as int),
          ),
          refreshToken: map['refreshToken']! as String,
          refreshTokenExpiresAt: now.add(
            Duration(seconds: map['refreshTokenExpiresIn']! as int),
          ),
        );
      },
      cancelToken: cancelToken,
    );
  }
}
