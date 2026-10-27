import 'dart:typed_data';

import '../domain/signature_drawing.dart';
import '../domain/signature_renderer.dart';

/// dart:ui(PictureRecorder -> toImage -> PNG)로 그리는 실제 렌더러(REQ-SIGN-005, 006).
/// 배치는 `SignatureGeometry.layout`을 쓰고, 획은 흰색 14px 둥근 끝·둥근 이음,
/// 이차 곡선(중간점 사이를 점으로 제어)으로 잇는다. 점 하나는 지름 14의 원이다.
class UiSignatureRenderer implements SignatureRenderer {
  const UiSignatureRenderer();

  @override
  Future<Uint8List> render(SignatureDrawing drawing) =>
      throw UnimplementedError();
}
