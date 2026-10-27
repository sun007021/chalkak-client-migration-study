import 'dart:typed_data';
import 'dart:ui' as ui;

import '../../../core/constants/app_constants.dart';
import '../domain/signature_drawing.dart';
import '../domain/signature_geometry.dart';
import '../domain/signature_renderer.dart';
import 'signature_path.dart';

/// dart:ui(PictureRecorder -> toImage -> PNG)로 그리는 실제 렌더러(REQ-SIGN-005, 006).
/// 배치는 `SignatureGeometry.layout`을 쓰고, 획은 흰색 14px 둥근 끝·둥근 이음,
/// 이차 곡선(중간점 사이를 점으로 제어)으로 잇는다. 점 하나는 지름 14의 원이다.
class UiSignatureRenderer implements SignatureRenderer {
  const UiSignatureRenderer();

  static const _width = AppConstants.signaturePngWidth;
  static const _height = AppConstants.signaturePngHeight;
  static const _strokeWidth = 14.0;

  @override
  Future<Uint8List> render(SignatureDrawing drawing) async {
    final strokes = SignatureGeometry.layout(
      drawing,
      width: _width,
      height: _height,
      padding: AppConstants.signaturePadding,
    );
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(
      recorder,
      ui.Rect.fromLTWH(0, 0, _width.toDouble(), _height.toDouble()),
    );
    final line = ui.Paint()
      ..color = const ui.Color(0xFFFFFFFF)
      ..style = ui.PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = ui.StrokeCap.round
      ..strokeJoin = ui.StrokeJoin.round
      ..isAntiAlias = true;
    final dot = ui.Paint()
      ..color = const ui.Color(0xFFFFFFFF)
      ..style = ui.PaintingStyle.fill
      ..isAntiAlias = true;

    for (final points in strokes) {
      if (points.every((p) => p == points.first)) {
        // 점 하나(또는 같은 점의 반복)는 길이 0 선분 대신 원으로 그린다.
        canvas.drawCircle(
          ui.Offset(points.first.x, points.first.y),
          _strokeWidth / 2,
          dot,
        );
      } else {
        canvas.drawPath(SignaturePath.smooth(points), line);
      }
    }

    final picture = recorder.endRecording();
    final image = await picture.toImage(_width, _height);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('PNG 인코딩에 실패했다');
      return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } finally {
      image.dispose();
      picture.dispose();
    }
  }
}
