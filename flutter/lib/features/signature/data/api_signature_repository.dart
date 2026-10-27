import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/signature_repository.dart';

class ApiSignatureRepository implements SignatureRepository {
  ApiSignatureRepository({required ApiClient client});

  @override
  Future<CurrentSignature> fetchCurrent({CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<SignatureUploadTicket> requestUpload({CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<void> confirm(String uploadId, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
