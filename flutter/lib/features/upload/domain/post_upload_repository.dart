import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'upload_models.dart';

/// 업로드 정책 발급, presigned PUT, 게시물 생성. 실패는 `ApiError`로 던진다.
abstract interface class PostUploadRepository {
  /// `POST /posts/uploads`(본문 없음, Authorization). 멱등이라 네트워크 오류·5xx에서 0.5초·1초
  /// 간격으로 최대 2회 자동 재시도한다(D-21). 필수 필드가 없거나 타입이 틀리면 invalidResponse.
  Future<UploadPolicy> requestPolicy({CancelToken? cancelToken});

  /// `PUT {uploadUrl}`. 인증 헤더 없음, `Content-Type`은 정책 값 그대로, 본문은 [bytes] 그대로,
  /// 60초 제한, 네트워크 오류·5xx에서 최대 2회 재시도(D-21). 평문 http 등 허용되지 않는 URL은
  /// 보내지 않고 invalidResponse.
  Future<void> putImage(
    UploadPolicy policy,
    Uint8List bytes, {
    CancelToken? cancelToken,
  });

  /// `POST /posts {topicId, photoUploadId, title}`. 자동 재시도 없음. [title]은 이미 strip한
  /// 값이며 null이면 `title: null`. 201 응답의 `moderationStatus`가 VALIDATING·PENDING이 아니거나
  /// 필드가 없으면 invalidResponse.
  Future<CreatedPost> createPost({
    required String topicId,
    required String uploadId,
    String? title,
    CancelToken? cancelToken,
  });
}
