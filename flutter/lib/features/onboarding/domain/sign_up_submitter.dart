import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../signature/domain/signature_failure.dart';
import 'sign_up_context.dart';
import 'sign_up_use_case.dart';

/// 가입 모드 미리보기가 쓰는 [SignatureSubmitter].
/// - 제출 때의 [SignUpContext.current]를 쓴다. 없으면 서버를 부르지 않고 expired 실패.
/// - 성공하면 컨텍스트를 폐기한다(REQ-ONB-019). expired 실패도 폐기한다(REQ-ONB-023).
///   그 밖의 실패는 컨텍스트를 유지해 다시 시도할 수 있다.
class SignUpSubmitter implements SignatureSubmitter {
  SignUpSubmitter({
    required SignUpUseCase useCase,
    required SignUpContext context,
  });

  @override
  Future<SignatureSubmitOutcome> submit(
    Uint8List png,
    CancelToken cancelToken,
  ) => throw UnimplementedError();
}
