import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/network/api_error.dart';
import '../../auth/domain/auth_repository.dart';
import '../../auth/domain/push_registrar.dart';
import '../../auth/domain/signup_credentials.dart';
import '../../signature/domain/signature_failure.dart';
import '../../signature/domain/signature_failure_mapper.dart';
import '../../signature/domain/signature_repository.dart';
import 'sign_up_repository.dart';

/// 가입 한 번(REQ-ONB-013~026, TC-ONB-019~044).
///
/// 순서: (1) uploads 발급 -> (2) presigned PUT -> (3) social-signup. 앞 단계가 실패하면 뒤 단계를
/// 부르지 않는다. 호출마다 (1)부터 새로 시작하고 같은 idToken·rawNonce를 쓴다.
/// (3)이 400 SIGNATURE_PROCESSING_PENDING이면 같은 signupToken으로
/// `SIGNUP_PENDING_RETRY_INTERVAL`(1초) 뒤 다시 요청한다. 최초 1회 + 재시도 최대 10회(총 11회)까지이고
/// 소진하면 [SignatureFailureKind.timeout]이다(마지막 응답 직후 추가 대기 없음). (1)·(2)는 다시 부르지 않는다.
///
/// 성공(200): 세션을 저장하고 푸시 등록을 시작한다(실패·지연 무시, 기다리지 않음). 별도 social-login
/// 재호출은 없다. 저장 직전에 [cancelToken]이 취소됐으면 저장하지 않고 Cancelled.
///
/// 실패 분류:
/// - (1) 400: 같은 idToken·rawNonce로 `AuthRepository.socialLogin`을 호출해 LOGIN_SUCCESS면
///   세션 저장 + 푸시 등록 후 Succeeded, SIGN_UP_REQUIRED·그 밖의 실패면 generic(네트워크는 network).
/// - (1)·(3) 401 -> expired, 403 -> forbidden(serverMessage)
/// - (3) 400 BUSINESS_ERROR -> invalid, 404 -> reupload
/// - 네트워크·타임아웃 -> network, 그 밖(5xx, 해석 불가, (2)의 PUT 오류 포함) -> generic
/// - ApiError.cancelled -> Cancelled
class SignUpUseCase {
  SignUpUseCase({
    required this._repository,
    required this._uploader,
    required this._authRepository,
    required this._sessions,
    required this._pushRegistrar,
  });

  final SignUpRepository _repository;
  final SignatureUploader _uploader;
  final AuthRepository _authRepository;
  final SessionManager _sessions;
  final PushRegistrar _pushRegistrar;

  Future<SignatureSubmitOutcome> call(
    SignUpCredentials credentials,
    Uint8List png, {
    CancelToken? cancelToken,
  }) async {
    try {
      return await _run(credentials, png, cancelToken);
    } on _SignUpFailure catch (e) {
      return _failed(e.failure);
    } on ApiError catch (e) {
      return _outcomeOf(e);
    } on Object {
      // 저장소 오류 등 예기치 못한 실패도 진행 표시가 남지 않게 일반 실패로 닫는다.
      return _failed(SignatureFailureMapper.generic);
    }
  }

  Future<SignatureSubmitOutcome> _run(
    SignUpCredentials credentials,
    Uint8List png,
    CancelToken? cancelToken,
  ) async {
    final SignUpUploadTicket ticket;
    try {
      ticket = await _repository.requestUpload(
        credentials,
        cancelToken: cancelToken,
      );
    } on ApiError catch (e) {
      if (e.status == 400) return _loginInstead(credentials, cancelToken);
      return _outcomeOf(e);
    }

    try {
      await _uploader.upload(
        ticket.upload.uploadUrl,
        png,
        cancelToken: cancelToken,
      );
    } on ApiError catch (e) {
      return e.isCancelled
          ? const SignatureSubmitCancelled()
          : _failed(SignatureFailureMapper.upload(e));
    }

    final session = await _confirm(ticket.signupToken, cancelToken);
    return _store(session, cancelToken);
  }

  /// 확정 호출. PENDING이면 1초 간격으로 최대 10회 더 시도하고, 소진하면 timeout 실패를 던진다.
  Future<Session> _confirm(String signupToken, CancelToken? cancelToken) async {
    for (var retry = 0; ; retry++) {
      try {
        return await _repository.signUp(signupToken, cancelToken: cancelToken);
      } on ApiError catch (e) {
        if (e.errorCode != ApiErrorCode.signatureProcessingPending) rethrow;
        if (retry >= AppConstants.signupPendingRetryMax) {
          throw const _SignUpFailure(
            SignatureFailure(SignatureFailureKind.timeout),
          );
        }
        await _wait(AppConstants.signupPendingRetryInterval, cancelToken);
      }
    }
  }

  /// (1)에서 400이면 이미 가입된 계정일 수 있어 같은 자격으로 로그인을 시도한다.
  Future<SignatureSubmitOutcome> _loginInstead(
    SignUpCredentials credentials,
    CancelToken? cancelToken,
  ) async {
    final SocialLoginResponse response;
    try {
      response = await _authRepository.socialLogin(
        idToken: credentials.idToken,
        rawNonce: credentials.rawNonce,
        cancelToken: cancelToken,
      );
    } on ApiError catch (e) {
      if (e.isCancelled) return const SignatureSubmitCancelled();
      return _failed(
        SignatureFailureMapper.common(e) ?? SignatureFailureMapper.generic,
      );
    }
    return switch (response) {
      SocialLoginSucceeded(:final session) => _store(session, cancelToken),
      SocialLoginSignUpRequired() => _failed(SignatureFailureMapper.generic),
    };
  }

  Future<SignatureSubmitOutcome> _store(
    Session session,
    CancelToken? cancelToken,
  ) async {
    if (cancelToken?.isCancelled ?? false) {
      return const SignatureSubmitCancelled();
    }
    await _sessions.save(session);
    _pushRegistrar.startRegistration();
    return const SignatureSubmitSucceeded();
  }

  Future<void> _wait(Duration duration, CancelToken? cancelToken) async {
    final delay = Future<void>.delayed(duration);
    if (cancelToken == null) return delay;
    await Future.any<void>([
      delay,
      cancelToken.whenCancel.then<void>((_) => throw ApiError.cancelled()),
    ]);
  }

  SignatureSubmitOutcome _outcomeOf(ApiError error) => error.isCancelled
      ? const SignatureSubmitCancelled()
      : _failed(_classifyError(error));

  /// (1)·(3)단계 공통 분류. 확정의 400 BUSINESS_ERROR는 invalid, 404는 reupload다.
  SignatureFailure _classifyError(ApiError e) {
    final common = SignatureFailureMapper.common(e);
    if (common != null) return common;
    if (e.status == 404) {
      return const SignatureFailure(SignatureFailureKind.reupload);
    }
    if (e.status == 400 && e.errorCode == ApiErrorCode.businessError) {
      return const SignatureFailure(SignatureFailureKind.invalid);
    }
    return SignatureFailureMapper.generic;
  }

  SignatureSubmitOutcome _failed(SignatureFailure failure) =>
      SignatureSubmitFailed(failure);
}

/// 확정 단계 안에서 이미 결과가 정해진 실패(PENDING 소진).
class _SignUpFailure implements Exception {
  const _SignUpFailure(this.failure);
  final SignatureFailure failure;
}
