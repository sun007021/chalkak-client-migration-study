import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/post_upload_repository.dart';
import '../domain/upload_models.dart';

/// [ApiClient] 위의 구현. PUT은 `ApiClient.putPresigned`(인증 헤더 없음, 60초, 재시도)를 쓴다.
class ApiPostUploadRepository implements PostUploadRepository {
  const ApiPostUploadRepository({required this.client});

  final ApiClient client;

  @override
  Future<UploadPolicy> requestPolicy({CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<void> putImage(
    UploadPolicy policy,
    Uint8List bytes, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<CreatedPost> createPost({
    required String topicId,
    required String uploadId,
    String? title,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
