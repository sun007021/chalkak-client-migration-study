import 'dart:typed_data';

import 'package:dio/dio.dart';

class SignatureUploadTicket {
  const SignatureUploadTicket({
    required this.uploadId,
    required this.uploadUrl,
    required this.expiresInSeconds,
  });

  final String uploadId;
  final Uri uploadUrl;
  final int expiresInSeconds;
}

class CurrentSignature {
  const CurrentSignature({required this.originalUrl, this.thumbnailUrl});

  final String originalUrl;
  final String? thumbnailUrl;

  /// 썸네일이 있으면 썸네일, 없으면(null) 원본(D-18).
  String get displayUrl => thumbnailUrl ?? originalUrl;
}

/// 설정의 사인 API. 오류는 [ApiError]로 던진다.
abstract interface class SignatureRepository {
  /// `GET /users/me/signature`.
  Future<CurrentSignature> fetchCurrent({CancelToken? cancelToken});

  /// `POST /users/me/signature/uploads`(본문 없음). contentType·maxBytes는 응답에 없다.
  Future<SignatureUploadTicket> requestUpload({CancelToken? cancelToken});

  /// `PUT /users/me/signature {signatureOriginalUploadId}`. 응답 URL은 쓰지 않는다(D-18).
  Future<void> confirm(String uploadId, {CancelToken? cancelToken});
}

/// presigned PUT. 가입과 변경이 같이 쓴다.
abstract interface class SignatureUploader {
  /// `Content-Type: image/png`, 인증 헤더 없음, 본문은 [png] 전체.
  /// 실패는 [ApiError]로 던진다(네트워크 vs 그 밖은 kind로 구분).
  Future<void> upload(Uri url, Uint8List png, {CancelToken? cancelToken});
}
