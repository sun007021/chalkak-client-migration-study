import 'dart:ui';

/// 핀치 줌 계산(REQ-FEED-011·012). 위젯과 무관한 순수 함수다.
/// 좌표는 사진 뷰포트의 왼쪽 위를 원점으로 하고, [offset]은 확대된 사진의 왼쪽 위 위치다.
abstract final class PhotoZoom {
  static const minScale = 1.0;
  static const maxScale = 4.0;

  /// 1배~4배로 맞춘다.
  static double clampScale(double scale) => throw UnimplementedError();

  /// 확대한 사진이 뷰포트를 벗어나지 않도록 [offset]을 맞춘다.
  /// `dx ∈ [viewport.width * (1 - scale), 0]`, `dy`도 같다. scale 1이면 (0, 0).
  static Offset clampOffset(Offset offset, double scale, Size viewport) =>
      throw UnimplementedError();

  /// 핀치 중 손가락 아래 사진 지점이 화면에서 움직이지 않도록 새 offset을 구한다.
  /// 제스처 시작 때의 [focalStart]·[offsetStart]·[scaleStart]와 지금의 [focalNow]·[scaleNow]
  /// (clamp 전 값 가능)로, `사진 지점 = (focalStart - offsetStart) / scaleStart`가 [focalNow]에
  /// 오도록 한 뒤 [clampOffset]한다. 두 손가락 팬은 focal의 이동으로 같은 식에 포함된다.
  static Offset anchoredOffset({
    required Offset focalStart,
    required Offset offsetStart,
    required double scaleStart,
    required Offset focalNow,
    required double scaleNow,
    required Size viewport,
  }) => throw UnimplementedError();
}
