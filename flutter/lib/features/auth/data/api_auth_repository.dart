import 'package:clock/clock.dart';
import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../domain/auth_repository.dart';

class ApiAuthRepository implements AuthRepository {
  ApiAuthRepository({required this._client});

  final ApiClient _client;

  @override
  Future<SocialLoginResponse> socialLogin({
    required String idToken,
    required String rawNonce,
    CancelToken? cancelToken,
  }) {
    return _client.request<SocialLoginResponse>(
      ApiRequest(
        HttpMethod.post,
        '/auth/social-login',
        body: {'provider': 'KAKAO', 'idToken': idToken, 'rawNonce': rawNonce},
      ),
      decode: _decode,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> logout({required String refreshToken}) {
    return _client.requestNoContent(
      ApiRequest(
        HttpMethod.post,
        '/auth/logout',
        body: {'refreshToken': refreshToken},
      ),
    );
  }

  @override
  Future<void> deleteAccount() {
    return _client.requestNoContent(
      const ApiRequest(HttpMethod.delete, '/users/me'),
    );
  }

  static SocialLoginResponse _decode(Object? json) {
    final map = json as Map;
    switch (map['status']) {
      case 'SIGN_UP_REQUIRED':
        return const SocialLoginSignUpRequired();
      case 'LOGIN_SUCCESS':
        final now = clock.now();
        return SocialLoginSucceeded(
          Session(
            userId: map['userId']! as String,
            accessToken: map['accessToken']! as String,
            accessTokenExpiresAt: now.add(
              Duration(seconds: map['expiresIn']! as int),
            ),
            refreshToken: map['refreshToken']! as String,
            refreshTokenExpiresAt: now.add(
              Duration(seconds: map['refreshTokenExpiresIn']! as int),
            ),
          ),
        );
      default:
        throw FormatException('알 수 없는 status: ${map['status']}');
    }
  }
}
