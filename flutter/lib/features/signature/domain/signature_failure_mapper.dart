import '../../../core/network/api_error.dart';
import 'signature_failure.dart';

/// 가입과 사인 변경이 같이 쓰는 [ApiError] -> [SignatureFailure] 분류.
class SignatureFailureMapper {
  const SignatureFailureMapper._();

  /// 단계와 상관없이 같은 분류: 연결 실패·타임아웃 -> network, 401 -> expired,
  /// 403 -> forbidden(서버 message 포함). 그 밖은 null이라 호출자가 단계별로 정한다.
  static SignatureFailure? common(ApiError error) {
    if (error.isNetwork) {
      return const SignatureFailure(SignatureFailureKind.network);
    }
    return switch (error.status) {
      401 => const SignatureFailure(SignatureFailureKind.expired),
      403 => SignatureFailure(
        SignatureFailureKind.forbidden,
        serverMessage: error.message,
      ),
      _ => null,
    };
  }

  /// presigned PUT(S3) 오류: 네트워크만 구분하고 그 밖은 모두 generic.
  static SignatureFailure upload(ApiError error) => error.isNetwork
      ? const SignatureFailure(SignatureFailureKind.network)
      : const SignatureFailure(SignatureFailureKind.generic);

  static const SignatureFailure generic = SignatureFailure(
    SignatureFailureKind.generic,
  );
}
