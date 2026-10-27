import 'dart:ui' as ui;

import '../domain/signature_drawing.dart';

/// 점 목록을 이웃한 두 점의 중간점을 지나고 각 점을 제어점으로 하는 이차 곡선으로 잇는다.
/// PNG 렌더러와 그리기 화면이 같은 모양을 쓰도록 한 곳에 둔다.
abstract final class SignaturePath {
  static ui.Path smooth(List<SignaturePoint> points) {
    final path = ui.Path()..moveTo(points.first.x, points.first.y);
    if (points.length == 2) {
      return path..lineTo(points.last.x, points.last.y);
    }
    for (var i = 1; i < points.length - 1; i++) {
      final control = points[i];
      final next = points[i + 1];
      path.quadraticBezierTo(
        control.x,
        control.y,
        (control.x + next.x) / 2,
        (control.y + next.y) / 2,
      );
    }
    return path..lineTo(points.last.x, points.last.y);
  }
}
