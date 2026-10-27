import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../../core/network/api_client.dart';
import '../../auth/domain/signup_credentials.dart';
import '../domain/sign_up_repository.dart';

class ApiSignUpRepository implements SignUpRepository {
  ApiSignUpRepository({required ApiClient client});

  @override
  Future<SignUpUploadTicket> requestUpload(
    SignUpCredentials credentials, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<Session> signUp(String signupToken, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
