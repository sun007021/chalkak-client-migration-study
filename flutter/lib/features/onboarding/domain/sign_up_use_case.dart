import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/auth/session_manager.dart';
import '../../auth/domain/auth_repository.dart';
import '../../auth/domain/push_registrar.dart';
import '../../auth/domain/signup_credentials.dart';
import '../../signature/domain/signature_failure.dart';
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
    required SignUpRepository repository,
    required SignatureUploader uploader,
    required AuthRepository authRepository,
    required SessionManager sessions,
    required PushRegistrar pushRegistrar,
  });

  Future<SignatureSubmitOutcome> call(
    SignUpCredentials credentials,
    Uint8List png, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
