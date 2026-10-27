import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/signature_repository.dart';

/// `ApiClient.putPresigned(contentType: image/png)`를 부른다.
class ApiSignatureUploader implements SignatureUploader {
  ApiSignatureUploader({required ApiClient client});

  @override
  Future<void> upload(Uri url, Uint8List png, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
