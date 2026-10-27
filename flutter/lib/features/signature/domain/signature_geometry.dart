import 'dart:math' as math;

import 'signature_drawing.dart';

/// 그린 점을 내보낼 PNG 좌표로 옮기는 순수 계산(REQ-SIGN-007). dart:ui에 의존하지 않는다.
///
/// 규칙: 점들의 외곽 박스를 캔버스 대비 비율로 정규화하고 한 변이 0.02보다 작으면 0.02로
/// 취급한 뒤, 비율을 유지한 채 `width - 2*padding` x `height - 2*padding` 영역에 중앙 정렬로
/// 맞춘다. 점 하나는 영역 중앙, 직선은 영역을 가로지르되 NaN·무한대가 나오지 않는다.
class SignatureGeometry {
  const SignatureGeometry._();

  /// 획마다 PNG 픽셀 좌표 목록. 빈 획은 결과에서 빠진다. 사인이 없으면 빈 목록.
  static List<List<SignaturePoint>> layout(
    SignatureDrawing drawing, {
    required int width,
    required int height,
    required int padding,
  }) {
    final points = [for (final stroke in drawing.strokes) ...stroke.points];
    if (points.isEmpty) return const [];

    // 캔버스 좌표를 PNG 좌표계 크기로 늘린 값에서 외곽 박스를 구한다.
    final sx = width / drawing.width;
    final sy = height / drawing.height;
    var minX = double.infinity, maxX = -double.infinity;
    var minY = double.infinity, maxY = -double.infinity;
    for (final p in points) {
      minX = math.min(minX, p.x * sx);
      maxX = math.max(maxX, p.x * sx);
      minY = math.min(minY, p.y * sy);
      maxY = math.max(maxY, p.y * sy);
    }
    final boxW = math.max(maxX - minX, _minRatio * width);
    final boxH = math.max(maxY - minY, _minRatio * height);
    final areaW = (width - 2 * padding).toDouble();
    final areaH = (height - 2 * padding).toDouble();
    final scale = math.min(areaW / boxW, areaH / boxH);
    final centerX = (minX + maxX) / 2;
    final centerY = (minY + maxY) / 2;

    return [
      for (final stroke in drawing.strokes)
        if (!stroke.isEmpty)
          [
            for (final p in stroke.points)
              SignaturePoint(
                width / 2 + (p.x * sx - centerX) * scale,
                height / 2 + (p.y * sy - centerY) * scale,
              ),
          ],
    ];
  }

  /// 외곽 박스 한 변의 최소 비율(캔버스 대비). 직선·점이 폭주하지 않게 한다.
  static const double _minRatio = 0.02;
}
