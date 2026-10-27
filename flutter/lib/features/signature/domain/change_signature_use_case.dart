import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/auth/session_manager.dart';
import '../../../core/network/api_error.dart';
import 'signature_failure.dart';
import 'signature_failure_mapper.dart';
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
    required this._repository,
    required this._uploader,
    required this._sessions,
  });

  final SignatureRepository _repository;
  final SignatureUploader _uploader;
  final SessionManager _sessions;

  @override
  Future<SignatureSubmitOutcome> submit(
    Uint8List png,
    CancelToken cancelToken,
  ) async {
    final startedAs = (await _sessions.read())?.userId;
    final SignatureSubmitOutcome outcome;
    try {
      await _upload(png, cancelToken);
      outcome = const SignatureSubmitSucceeded();
    } on _ChangeFailure catch (e) {
      return await _unlessSessionChanged(startedAs, e.outcome);
    }
    return _unlessSessionChanged(startedAs, outcome);
  }

  Future<void> _upload(Uint8List png, CancelToken cancelToken) async {
    final SignatureUploadTicket ticket;
    try {
      ticket = await _repository.requestUpload(cancelToken: cancelToken);
    } on ApiError catch (e) {
      throw _ChangeFailure.of(e, _classifyApi(e));
    }
    try {
      await _uploader.upload(ticket.uploadUrl, png, cancelToken: cancelToken);
    } on ApiError catch (e) {
      throw _ChangeFailure.of(e, SignatureFailureMapper.upload(e));
    }
    try {
      await _repository.confirm(ticket.uploadId, cancelToken: cancelToken);
    } on ApiError catch (e) {
      throw _ChangeFailure.of(e, _classifyConfirm(e));
    }
  }

  /// 발급 단계: 403 forbidden, 401 expired, 네트워크 network, 그 밖 generic.
  SignatureFailure _classifyApi(ApiError e) =>
      SignatureFailureMapper.common(e) ?? SignatureFailureMapper.generic;

  /// 확정 단계: 발급 단계 분류에 더해 400 REUPLOAD -> reupload, 400 BUSINESS_ERROR -> invalid,
  /// 404 -> notFound.
  SignatureFailure _classifyConfirm(ApiError e) {
    final common = SignatureFailureMapper.common(e);
    if (common != null) return common;
    if (e.status == 404) {
      return const SignatureFailure(SignatureFailureKind.notFound);
    }
    if (e.status == 400) {
      return switch (e.errorCode) {
        ApiErrorCode.signatureReuploadRequired => const SignatureFailure(
          SignatureFailureKind.reupload,
        ),
        ApiErrorCode.businessError => const SignatureFailure(
          SignatureFailureKind.invalid,
        ),
        _ => SignatureFailureMapper.generic,
      };
    }
    return SignatureFailureMapper.generic;
  }

  /// 요청을 보내는 사이 계정이 바뀌었거나 로그아웃됐으면 결과를 버린다(TC-SIGN-038).
  /// 만료 실패는 세션이 지워진 것이 원인이므로 그대로 돌려준다.
  Future<SignatureSubmitOutcome> _unlessSessionChanged(
    String? startedAs,
    SignatureSubmitOutcome outcome,
  ) async {
    if (outcome is SignatureSubmitCancelled) return outcome;
    if (outcome is SignatureSubmitFailed &&
        outcome.failure.kind == SignatureFailureKind.expired) {
      return outcome;
    }
    final now = (await _sessions.read())?.userId;
    return now == startedAs ? outcome : const SignatureSubmitCancelled();
  }
}

/// 단계 안에서 결과가 정해진 실패(취소 포함).
class _ChangeFailure implements Exception {
  const _ChangeFailure(this.outcome);

  factory _ChangeFailure.of(ApiError error, SignatureFailure failure) =>
      _ChangeFailure(
        error.isCancelled
            ? const SignatureSubmitCancelled()
            : SignatureSubmitFailed(failure),
      );

  final SignatureSubmitOutcome outcome;
}
