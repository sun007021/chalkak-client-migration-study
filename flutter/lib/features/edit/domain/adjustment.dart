import '../../../core/copy/ko.g.dart';

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
  String get label => switch (this) {
    auto => Copy.editAdjustAuto,
    exposure => Copy.editAdjustExposure,
    contrast => Copy.editAdjustContrast,
    highlights => Copy.editAdjustHighlights,
    shadows => Copy.editAdjustShadows,
    blackPoint => Copy.editAdjustBlackPoint,
    saturation => Copy.editAdjustSaturation,
    warmth => Copy.editAdjustWarmth,
  };

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
  double of(AdjustItem item) => switch (item) {
    AdjustItem.auto => throw ArgumentError.value(item, 'item', '값 항목이 아니다'),
    AdjustItem.exposure => exposure,
    AdjustItem.contrast => contrast,
    AdjustItem.highlights => highlights,
    AdjustItem.shadows => shadows,
    AdjustItem.blackPoint => blackPoint,
    AdjustItem.saturation => saturation,
    AdjustItem.warmth => warmth,
  };

  AdjustmentValues withItem(AdjustItem item, double value) => switch (item) {
    AdjustItem.auto => throw ArgumentError.value(item, 'item', '값 항목이 아니다'),
    AdjustItem.exposure => _copy(exposure: value),
    AdjustItem.contrast => _copy(contrast: value),
    AdjustItem.highlights => _copy(highlights: value),
    AdjustItem.shadows => _copy(shadows: value),
    AdjustItem.blackPoint => _copy(blackPoint: value),
    AdjustItem.saturation => _copy(saturation: value),
    AdjustItem.warmth => _copy(warmth: value),
  };

  AdjustmentValues _copy({
    double? exposure,
    double? contrast,
    double? highlights,
    double? shadows,
    double? blackPoint,
    double? saturation,
    double? warmth,
  }) => AdjustmentValues(
    exposure: exposure ?? this.exposure,
    contrast: contrast ?? this.contrast,
    highlights: highlights ?? this.highlights,
    shadows: shadows ?? this.shadows,
    blackPoint: blackPoint ?? this.blackPoint,
    saturation: saturation ?? this.saturation,
    warmth: warmth ?? this.warmth,
  );

  bool get isZero =>
      exposure == 0 &&
      contrast == 0 &&
      highlights == 0 &&
      shadows == 0 &&
      blackPoint == 0 &&
      saturation == 0 &&
      warmth == 0;

  @override
  bool operator ==(Object other) =>
      other is AdjustmentValues &&
      other.exposure == exposure &&
      other.contrast == contrast &&
      other.highlights == highlights &&
      other.shadows == shadows &&
      other.blackPoint == blackPoint &&
      other.saturation == saturation &&
      other.warmth == warmth;

  @override
  int get hashCode => Object.hash(
    exposure,
    contrast,
    highlights,
    shadows,
    blackPoint,
    saturation,
    warmth,
  );
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
  double autoShare(AdjustItem item) => autoValues.of(item) * autoStrength;

  /// 항목에 실제 적용되는 값.
  double effective(AdjustItem item) => userValues[item] ?? autoShare(item);

  /// 7항목 전체의 적용 값.
  AdjustmentValues get effectiveValues => AdjustmentValues(
    exposure: effective(AdjustItem.exposure),
    contrast: effective(AdjustItem.contrast),
    highlights: effective(AdjustItem.highlights),
    shadows: effective(AdjustItem.shadows),
    blackPoint: effective(AdjustItem.blackPoint),
    saturation: effective(AdjustItem.saturation),
    warmth: effective(AdjustItem.warmth),
  );

  bool isUserTouched(AdjustItem item) => userValues.containsKey(item);

  /// [value]를 항목 값으로 정한다. 자동 보정 몫과 같은 값이면 직접 만진 표시를 지워
  /// 그 항목이 다시 자동 보정을 따르게 한다(REQ-EDIT-023).
  AdjustmentLayers withValue(AdjustItem item, double value) {
    final next = Map<AdjustItem, double>.of(userValues);
    if ((value - autoShare(item)).abs() < 1e-6) {
      next.remove(item);
    } else {
      next[item] = value;
    }
    return _copy(userValues: next);
  }

  AdjustmentLayers withAutoStrength(double strength) =>
      _copy(autoStrength: strength);

  AdjustmentLayers withAutoValues(AdjustmentValues values) =>
      _copy(autoValues: values);

  AdjustmentLayers _copy({
    AdjustmentValues? autoValues,
    double? autoStrength,
    Map<AdjustItem, double>? userValues,
  }) => AdjustmentLayers(
    autoValues: autoValues ?? this.autoValues,
    autoStrength: autoStrength ?? this.autoStrength,
    userValues: userValues ?? this.userValues,
  );

  /// 조정 탭 "초기화": 강도 0, 직접 만진 값 모두 지움, 분석해 둔 자동값은 유지(REQ-EDIT-024).
  AdjustmentLayers cleared() => AdjustmentLayers(autoValues: autoValues);

  /// 적용 값이 전부 0인가.
  bool get isIdentity => effectiveValues.isZero;

  @override
  bool operator ==(Object other) {
    if (other is! AdjustmentLayers) return false;
    if (other.autoValues != autoValues ||
        other.autoStrength != autoStrength ||
        other.userValues.length != userValues.length) {
      return false;
    }
    for (final e in userValues.entries) {
      if (other.userValues[e.key] != e.value) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hash(
    autoValues,
    autoStrength,
    Object.hashAllUnordered(
      userValues.entries.map((e) => Object.hash(e.key, e.value)),
    ),
  );
}
