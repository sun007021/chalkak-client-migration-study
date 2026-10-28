import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../edit/domain/photo_edit.dart';
import 'monotonic_clock.dart';
import 'photo_file_store.dart';
import 'post_image_encoder.dart';
import 'post_upload_repository.dart';
import 'upload_models.dart';

/// 편집을 마친 직후의 백그라운드 준비: 정책 발급 -> WebP 인코딩 -> 임시 파일(REQ-UPL-025~026).
/// S3로는 보내지 않는다. 모든 실패는 [UploadFailure]로 던진다.
///
/// 실패 매핑(REQ-UPL-056~058, D-02):
/// - 401(갱신 후에도) -> [UploadFailureKind.loginRequired]
/// - 403 -> `Copy.uploadGateBanned`, 재요청 없음
/// - 네트워크 -> `Copy.uploadErrorNetwork`
/// - 그 밖(5xx, 계약 위반, 정책 contentType이 image/webp가 아님, 인코딩 실패, 빈 사진)
///   -> `Copy.uploadErrorPrepare`
/// - 취소 -> [UploadFailureKind.cancelled]
/// 인코딩 도중 취소되거나 실패하면 만든 임시 파일을 지운다.
/// `contentType`이 image/webp가 아니면 인코딩을 시작하지 않는다.
class UploadPreparer {
  const UploadPreparer({
    required this.repository,
    required this.encoder,
    required this.files,
    required this.monotonic,
  });

  final PostUploadRepository repository;
  final PostImageEncoder encoder;
  final PhotoFileStore files;
  final MonotonicClock monotonic;

  /// 새 정책을 받고([PreparedUpload.issuedAt] = 응답을 받은 단조 시각) [source]를 [edit]로
  /// 인코딩해 저장한다. 인코딩의 maxBytes는 정책 응답값이다.
  Future<PreparedUpload> prepare(
    Uint8List source,
    PhotoEdit edit, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  /// 제출 직전 만료 확인(REQ-UPL-041~042). 만료 전이면 [prepared]를 그대로 돌려준다.
  /// 만료(경과 >= expiresInSeconds - 5초)면 새 정책(새 uploadId)을 받고, 새 maxBytes가 파일 크기
  /// 이상이면 파일을 재사용하고 작으면 저장된 편집값으로 원본에서 다시 인코딩한다(이전 파일 삭제).
  /// 새 정책의 contentType이 image/webp가 아니면 업로드하지 않고 `Copy.uploadErrorPrepare`.
  Future<PreparedUpload> refresh(
    PreparedUpload prepared,
    Uint8List source, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  /// 임시 파일을 지운다(여러 번 불러도 된다).
  Future<void> discard(PreparedUpload prepared) => throw UnimplementedError();
}
