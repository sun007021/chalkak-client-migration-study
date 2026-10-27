import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/auth_repository.dart';

class ApiAuthRepository implements AuthRepository {
  ApiAuthRepository({required ApiClient client});

  @override
  Future<SocialLoginResponse> socialLogin({
    required String idToken,
    required String rawNonce,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<void> logout({required String refreshToken}) =>
      throw UnimplementedError();

  @override
  Future<void> deleteAccount() => throw UnimplementedError();
}
