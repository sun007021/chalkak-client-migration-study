/// 편집 연산 수치 상수(features/upload-edit.md 부록). 값은
/// `shared/photo-edit/filters.json`과 같아야 한다(TC-EDIT-036).
abstract final class PhotoEditConstants {
  /// 노출 1.0이 올리는 밝기(EV). 빛 배율 = 2^(1.5 x v).
  static const double exposureEv = 1.5;
  static const double warmthGain = 0.25;
  static const double blackPointRange = 0.3;
  static const double shadowsAmount = 0.25;
  static const double highlightsAmount = 0.25;
  static const double contrastAmount = 0.6;

  /// 자동 보정 분석 표본의 긴 변.
  static const int autoSampleLongEdge = 256;
  static const double autoWhiteTarget = 0.96;
  static const double autoExposureMinEv = -0.5;
  static const double autoExposureMaxEv = 1.0;

  /// 편집 미리보기 긴 변 상한(REQ-EDIT-007).
  static const int previewLongEdge = 1440;

  /// 조정 눈금자: 단위(1.0)당 dp와 눈금 수(TC-EDIT-038).
  static const double rulerDpPerUnit = 400;
  static const int rulerTicks = 50;
}
