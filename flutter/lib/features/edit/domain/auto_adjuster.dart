import 'adjustment.dart';
import 'rgba_image.dart';

/// 자동 보정 분석기 인터페이스. 편집기 ViewModel은 이것만 안다(TC-EDIT-001, 037의 호출 수 확인).
abstract interface class AutoAdjustAnalyzer {
  /// [region]을 긴 변 256 px로 줄여 분석한 자동 보정값. 분석할 수 없으면 0(REQ-EDIT-027).
  Future<AdjustmentValues> analyze(RgbaImage region);
}

/// 자동 보정 분석(REQ-EDIT-025~027, 부록 "자동 보정 상수"·"자동 보정 식").
/// 순서: 노출 -> 블랙 포인트 -> 그림자·하이라이트·대비 -> 채도(따뜻함은 정하지 않는다).
/// 각 값은 소수 둘째 자리로 반올림한다(0.5는 0에서 먼 쪽).
class AutoAdjuster implements AutoAdjustAnalyzer {
  const AutoAdjuster();

  @override
  Future<AdjustmentValues> analyze(RgbaImage region) =>
      throw UnimplementedError();

  /// 채도 세기 = 가장 큰 채널 - 가장 작은 채널(0~1). 색상(hue)과 무관하다(TC-EDIT-035).
  static double chroma(int r, int g, int b) => throw UnimplementedError();

  /// 피부색 판정: R >= G >= B, R >= 0.2, (R-B)/R가 0.1~0.6, 색상 0~50도.
  static bool isSkin(int r, int g, int b) => throw UnimplementedError();
}
