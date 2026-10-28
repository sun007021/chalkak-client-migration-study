/// 조정 항목. 선언 순서가 화면 순서이고 처음 선택은 [auto](REQ-EDIT-019~020).
enum AdjustItem {
  auto,
  exposure,
  contrast,
  highlights,
  shadows,
  blackPoint,
  saturation,
  warmth;

  /// `Copy.editAdjust*` 문구.
  String get label => throw UnimplementedError();

  /// [auto]를 뺀 7개 값 항목인가.
  bool get isValue => this != auto;
}

/// 조정 7항목의 값. 범위는 -1~1이고 화면 표시는 100배한 정수 -100~100이다(REQ-EDIT-019).
class AdjustmentValues {
  const AdjustmentValues({
    this.exposure = 0,
    this.contrast = 0,
    this.highlights = 0,
    this.shadows = 0,
    this.blackPoint = 0,
    this.saturation = 0,
    this.warmth = 0,
  });

  static const AdjustmentValues zero = AdjustmentValues();

  final double exposure;
  final double contrast;
  final double highlights;
  final double shadows;
  final double blackPoint;
  final double saturation;
  final double warmth;

  /// [item]의 값. [AdjustItem.auto]는 ArgumentError.
  double of(AdjustItem item) => throw UnimplementedError();

  AdjustmentValues withItem(AdjustItem item, double value) =>
      throw UnimplementedError();

  bool get isZero => throw UnimplementedError();

  @override
  bool operator ==(Object other) => throw UnimplementedError();

  @override
  int get hashCode => throw UnimplementedError();
}

/// 자동 보정값 + 강도 + 사용자가 직접 만진 값(REQ-EDIT-022~024, PE §4).
/// 항목에 적용되는 값: 직접 만졌으면 그 값, 아니면 자동값 x 강도.
class AdjustmentLayers {
  const AdjustmentLayers({
    this.autoValues = AdjustmentValues.zero,
    this.autoStrength = 0,
    this.userValues = const {},
  });

  static const AdjustmentLayers none = AdjustmentLayers();

  /// 분석해 둔 자동 보정값(분석 전에는 0).
  final AdjustmentValues autoValues;

  /// 0~1. 0이면 꺼짐.
  final double autoStrength;

  /// 사용자가 직접 만진 항목만 들어 있다(-1~1).
  final Map<AdjustItem, double> userValues;

  /// 자동 보정 몫 = 자동값 x 강도(꺼져 있으면 0).
  double autoShare(AdjustItem item) => throw UnimplementedError();

  /// 항목에 실제 적용되는 값.
  double effective(AdjustItem item) => throw UnimplementedError();

  /// 7항목 전체의 적용 값.
  AdjustmentValues get effectiveValues => throw UnimplementedError();

  bool isUserTouched(AdjustItem item) => throw UnimplementedError();

  /// [value]를 항목 값으로 정한다. 자동 보정 몫과 같은 값이면 직접 만진 표시를 지워
  /// 그 항목이 다시 자동 보정을 따르게 한다(REQ-EDIT-023).
  AdjustmentLayers withValue(AdjustItem item, double value) =>
      throw UnimplementedError();

  AdjustmentLayers withAutoStrength(double strength) =>
      throw UnimplementedError();

  AdjustmentLayers withAutoValues(AdjustmentValues values) =>
      throw UnimplementedError();

  /// 조정 탭 "초기화": 강도 0, 직접 만진 값 모두 지움, 분석해 둔 자동값은 유지(REQ-EDIT-024).
  AdjustmentLayers cleared() => throw UnimplementedError();

  /// 적용 값이 전부 0인가.
  bool get isIdentity => throw UnimplementedError();

  @override
  bool operator ==(Object other) => throw UnimplementedError();

  @override
  int get hashCode => throw UnimplementedError();
}
