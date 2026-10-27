import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/auth/session_manager.dart';
import 'signature_failure.dart';
import 'signature_repository.dart';

/// 설정의 사인 변경(REQ-SIGN-020~029).
/// 순서: uploads 발급 -> presigned PUT -> `PUT /users/me/signature`. 앞 단계가 실패하면
/// 다음 단계를 부르지 않고, 호출마다 새 uploads부터 시작한다(uploadId 재사용 없음).
///
/// 실패 분류(단계 인식):
/// - 발급·확정 단계: 403 -> forbidden, 401(갱신 후에도) -> expired,
///   확정 400 SIGNATURE_REUPLOAD_REQUIRED -> reupload, 확정 400 그 밖 -> invalid,
///   확정 404 -> notFound, 네트워크 -> network, 그 밖 -> generic
/// - 업로드 PUT 단계: 네트워크 -> network, 그 밖(S3 403 포함) -> generic
/// - ApiError.cancelled -> [SignatureSubmitCancelled]
/// 호출 시작 때의 세션과 끝날 때의 세션(userId)이 다르면 결과를 버린다(Cancelled, TC-SIGN-038).
class ChangeSignatureUseCase implements SignatureSubmitter {
  ChangeSignatureUseCase({
    required SignatureRepository repository,
    required SignatureUploader uploader,
    required SessionManager sessions,
  });

  @override
  Future<SignatureSubmitOutcome> submit(
    Uint8List png,
    CancelToken cancelToken,
  ) => throw UnimplementedError();
}
