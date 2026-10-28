import 'adjustment.dart';
import 'photo_filter.dart';
import 'rgba_image.dart';

/// 톤 곡선 구성 함수(부록 "조정 항목 상수"). 입력·출력은 0~1 저장 값 t.
abstract final class ToneCurves {
  /// 그림자: `t += v x 0.25 x 4 x t x (1 - t)^2`.
  static double shadows(double t, double v) => throw UnimplementedError();

  /// 하이라이트: `t += v x 0.25 x 4 x t^2 x (1 - t)`.
  static double highlights(double t, double v) => throw UnimplementedError();

  /// 대비: `t -= v x 0.6 x sin(2 pi t) / (2 pi)`.
  static double contrast(double t, double v) => throw UnimplementedError();

  /// 256칸 톤 곡선 표. 블랙 포인트 -> 그림자 -> 하이라이트 -> 대비 순서로 t를 갱신하고
  /// 누적 최대값을 취해 줄어들지 않게 한다. 첫 칸은 outputBlack, 마지막 칸은 1이다.
  static List<double> table({
    double blackPoint = 0,
    double shadows = 0,
    double highlights = 0,
    double contrast = 0,
  }) => throw UnimplementedError();
}

/// 색 변환: 선형 단계(노출·따뜻함·채도) -> 감마 -> 톤 곡선 -> 필터 행렬(REQ-EDIT-008, 029).
/// sRGB 변환식과 순서는 부록 "sRGB 변환과 처리 순서". 알파는 조정 단계에서 바꾸지 않는다.
abstract final class PhotoColorPipeline {
  /// 한 픽셀 [r, g, b, a](0~255)에 조정과 필터를 적용한 [r, g, b, a].
  /// 조정이 모두 0이고 필터가 원본이면 입력과 같다.
  static List<int> applyPixel(
    List<int> rgba, {
    AdjustmentValues adjustments = AdjustmentValues.zero,
    PhotoFilter filter = PhotoFilter.original,
  }) => throw UnimplementedError();

  /// 이미지 전체에 적용한 새 이미지(크기 유지).
  static RgbaImage apply(
    RgbaImage image, {
    AdjustmentValues adjustments = AdjustmentValues.zero,
    PhotoFilter filter = PhotoFilter.original,
  }) => throw UnimplementedError();
}
