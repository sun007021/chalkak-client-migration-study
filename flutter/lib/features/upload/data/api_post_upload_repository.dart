import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../../home/domain/home_models.dart';
import '../domain/post_upload_repository.dart';
import '../domain/upload_models.dart';

/// [ApiClient] 위의 구현. PUT은 `ApiClient.putPresigned`(인증 헤더 없음, 60초, 재시도)를 쓴다.
class ApiPostUploadRepository implements PostUploadRepository {
  const ApiPostUploadRepository({required this.client});

  final ApiClient client;

  @override
  Future<UploadPolicy> requestPolicy({CancelToken? cancelToken}) {
    return client.request<UploadPolicy>(
      const ApiRequest(HttpMethod.post, '/posts/uploads'),
      decode: (json) {
        final map = json! as Map<String, Object?>;
        return UploadPolicy(
          uploadId: map['uploadId']! as String,
          uploadUrl: Uri.parse(map['uploadUrl']! as String),
          expiresInSeconds: map['expiresInSeconds']! as int,
          contentType: map['contentType']! as String,
          maxBytes: map['maxBytes']! as int,
        );
      },
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> putImage(
    UploadPolicy policy,
    Uint8List bytes, {
    CancelToken? cancelToken,
  }) {
    return client.putPresigned(
      url: policy.uploadUrl,
      bytes: bytes,
      contentType: policy.contentType,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<CreatedPost> createPost({
    required String topicId,
    required String uploadId,
    String? title,
    CancelToken? cancelToken,
  }) {
    return client.request<CreatedPost>(
      ApiRequest(
        HttpMethod.post,
        '/posts',
        body: {'topicId': topicId, 'photoUploadId': uploadId, 'title': title},
      ),
      decode: (json) {
        final map = json! as Map<String, Object?>;
        final status = switch (map['moderationStatus']) {
          'VALIDATING' => ModerationStatus.validating,
          'PENDING' => ModerationStatus.pending,
          final other => throw FormatException('알 수 없는 검수 상태', other),
        };
        return CreatedPost(
          postId: map['postId']! as String,
          moderationStatus: status,
        );
      },
      cancelToken: cancelToken,
    );
  }
}
