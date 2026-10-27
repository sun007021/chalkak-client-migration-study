import 'dart:typed_data';

import 'signature_drawing.dart';

/// 획을 투명 배경 + 흰 획 1024x512 PNG 바이트로 만든다(REQ-SIGN-006).
/// 실제 구현은 dart:ui를 쓰므로 인터페이스 뒤에 두고, 크기 정책은 [SignatureImageGuard]가 맡는다.
abstract interface class SignatureRenderer {
  Future<Uint8List> render(SignatureDrawing drawing);
}

/// 인코딩한 PNG 바이트를 서버에 보내도 되는지 판정한다(SIGN-002).
class SignatureImageGuard {
  const SignatureImageGuard._();

  /// `SIGNATURE_MAX_BYTES`(1,048,576) 이하이면 true. 초과는 false.
  static bool isWithinLimit(Uint8List png) => throw UnimplementedError();
}
