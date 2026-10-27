import 'dart:typed_data';

import 'package:dio/dio.dart';

enum SignatureFailureKind {
  /// 연결 실패·타임아웃 -> `sign.error.network`
  network,

  /// 그 밖의 실패(5xx, 업로드 PUT 오류, 해석 불가) -> 모드별 generic 문구
  generic,

  /// 401, 가입 컨텍스트 없음 -> `sign.error.expired` + 로그인 화면
  expired,

  /// 403 FORBIDDEN. 가입은 서버 message, 변경은 `auth.banned.signature`
  forbidden,

  /// 400 BUSINESS_ERROR(사용할 수 없는 사인) -> `sign.error.invalid` + 그리기 화면
  invalid,

  /// 가입 404, 변경 400 SIGNATURE_REUPLOAD_REQUIRED -> `onb.signup.error.reupload`
  reupload,

  /// 변경 PUT 404 -> `sign.change.error.not-found`
  notFound,

  /// 가입 PENDING 재시도 소진 -> `onb.signup.error.timeout`
  timeout,
}

class SignatureFailure {
  const SignatureFailure(this.kind, {this.serverMessage});

  final SignatureFailureKind kind;

  /// 서버가 준 message. forbidden(가입)에서만 화면에 쓴다.
  final String? serverMessage;
}

sealed class SignatureSubmitOutcome {
  const SignatureSubmitOutcome();
}

final class SignatureSubmitSucceeded extends SignatureSubmitOutcome {
  const SignatureSubmitSucceeded();
}

final class SignatureSubmitFailed extends SignatureSubmitOutcome {
  const SignatureSubmitFailed(this.failure);
  final SignatureFailure failure;
}

/// 취소됐거나 결과가 낡았다(화면 이탈, 계정 전환). 오류 문구 없이 버린다.
final class SignatureSubmitCancelled extends SignatureSubmitOutcome {
  const SignatureSubmitCancelled();
}

/// 미리보기의 확정 버튼이 부르는 서버 흐름. 가입과 사인 변경이 각각 구현한다.
abstract interface class SignatureSubmitter {
  Future<SignatureSubmitOutcome> submit(Uint8List png, CancelToken cancelToken);
}
