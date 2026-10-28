import 'dart:math' as math;
import 'dart:typed_data';

import 'adjustment.dart';
import 'photo_edit_constants.dart';
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

  static const _whitePercentile = 0.995;
  static const _minWhite = 0.05;
  static const _tempering = 0.6;
  static const _brightMedian = 0.62;
  static const _brightSlope = 1.2;
  static const _blackPercentile = 0.005;
  static const _blackMargin = 0.01;
  static const _blackTempering = 0.8;
  static const _blackCap = 0.25;
  static const _darkLimit = 0.25;
  static const _darkFull = 0.8;
  static const _shadowMax = 0.45;
  static const _brightLimit = 0.85;
  static const _brightFull = 0.3;
  static const _highlightMax = -0.5;
  static const _toneExponent = 0.7;
  static const _contrastTarget = 0.42;
  static const _contrastSlope = 2.0;
  static const _contrastMax = 0.4;
  static const _grayLimit = 0.05;
  static const _satTarget = 0.7;
  static const _satSlope = 0.6;
  static const _satMax = 0.25;

  @override
  Future<AdjustmentValues> analyze(RgbaImage region) async {
    if (region.width <= 0 ||
        region.height <= 0 ||
        region.rgba.length < region.width * region.height * 4) {
      return AdjustmentValues.zero;
    }
    final sample = _downscale(region);
    final count = sample.width * sample.height;
    final hist = List<int>.filled(256, 0);
    final chromaHist = List<int>.filled(256, 0);
    var skin = 0;
    final px = sample.rgba;
    for (var o = 0; o < count * 4; o += 4) {
      final r = px[o];
      final g = px[o + 1];
      final b = px[o + 2];
      final l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      hist[math.min(255, (l * 255).round())]++;
      chromaHist[(chroma(r, g, b) * 255).round()]++;
      if (isSkin(r, g, b)) skin++;
    }

    double percentile(List<int> h, double f) {
      final target = f * count - 1e-9;
      var cum = 0;
      for (var i = 0; i < 256; i++) {
        cum += h[i];
        if (cum >= target) return i / 255;
      }
      return 1.0;
    }

    double linear(double x) => x <= 0.04045
        ? x / 12.92
        : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    double gamma(double x) => x <= 0.0031308
        ? 12.92 * x
        : 1.055 * math.pow(x, 1 / 2.4).toDouble() - 0.055;

    // 노출
    final white = percentile(hist, _whitePercentile);
    final median = percentile(hist, 0.5);
    var ev = 0.0;
    if (white < PhotoEditConstants.autoWhiteTarget) {
      ev =
          _log2(
            linear(PhotoEditConstants.autoWhiteTarget) /
                linear(math.max(white, _minWhite)),
          ) *
          _tempering;
    } else if (median > _brightMedian) {
      ev = -(median - _brightMedian) * _brightSlope;
    }
    ev = ev.clamp(
      PhotoEditConstants.autoExposureMinEv,
      PhotoEditConstants.autoExposureMaxEv,
    );
    final exposure = _round2(ev / PhotoEditConstants.exposureEv);

    double expose(double l) => gamma(
      math.min(
        1.0,
        linear(l) * math.pow(2, PhotoEditConstants.exposureEv * exposure),
      ),
    );

    // 블랙 포인트
    final black = expose(percentile(hist, _blackPercentile));
    final inputBlack = math.min(
      math.max(black - _blackMargin, 0) * _blackTempering,
      _blackCap,
    );
    final blackPoint = _round2(inputBlack / PhotoEditConstants.blackPointRange);

    final ib = math.max(blackPoint, 0) * PhotoEditConstants.blackPointRange;
    double afterBlack(double l) =>
        ((expose(l) - ib) / (1 - ib)).clamp(0.0, 1.0).toDouble();

    // 그림자·하이라이트
    var dark = 0.0;
    var bright = 0.0;
    for (var i = 0; i < 256; i++) {
      if (hist[i] == 0) continue;
      final a = afterBlack(i / 255);
      final share = hist[i] / count;
      if (a < _darkLimit) dark += share;
      if (a > _brightLimit) bright += share;
    }
    final shadows = _round2(
      _shadowMax * math.pow((dark / _darkFull).clamp(0.0, 1.0), _toneExponent),
    );
    final highlights = _round2(
      _highlightMax *
          math.pow((bright / _brightFull).clamp(0.0, 1.0), _toneExponent),
    );

    // 대비
    final spread =
        afterBlack(percentile(hist, 0.75)) - afterBlack(percentile(hist, 0.25));
    final contrast = _round2(
      ((_contrastTarget - spread) * _contrastSlope).clamp(0.0, _contrastMax),
    );

    // 채도
    final s = percentile(chromaHist, 0.9);
    var saturation = 0.0;
    if (s > _grayLimit) {
      final lift = ((_satTarget - s) * _satSlope).clamp(0.0, _satMax);
      saturation = _round2(lift * (1 - skin / count));
    }

    return AdjustmentValues(
      exposure: exposure,
      contrast: contrast,
      highlights: highlights,
      shadows: shadows,
      blackPoint: blackPoint,
      saturation: saturation,
    );
  }

  static double _log2(double x) => math.log(x) / math.ln2;

  /// `sign(v) x floor(|v| x 100 + 0.5) / 100`. -0은 0으로 돌려준다.
  static double _round2(double v) {
    if (v == 0) return 0;
    final r = (v.abs() * 100 + 0.5).floorToDouble() / 100;
    if (r == 0) return 0;
    return v < 0 ? -r : r;
  }

  static RgbaImage _downscale(RgbaImage image) {
    const limit = PhotoEditConstants.autoSampleLongEdge;
    final longEdge = math.max(image.width, image.height);
    if (longEdge <= limit) return image;
    final scale = limit / longEdge;
    final w = math.max(1, (image.width * scale).round());
    final h = math.max(1, (image.height * scale).round());
    final out = RgbaImage(width: w, height: h, rgba: Uint8List(w * h * 4));
    for (var y = 0; y < h; y++) {
      final sy = math.min(image.height - 1, ((y + 0.5) / scale).floor());
      for (var x = 0; x < w; x++) {
        final sx = math.min(image.width - 1, ((x + 0.5) / scale).floor());
        final so = (sy * image.width + sx) * 4;
        final d = (y * w + x) * 4;
        out.rgba[d] = image.rgba[so];
        out.rgba[d + 1] = image.rgba[so + 1];
        out.rgba[d + 2] = image.rgba[so + 2];
        out.rgba[d + 3] = image.rgba[so + 3];
      }
    }
    return out;
  }

  /// 채도 세기 = 가장 큰 채널 - 가장 작은 채널(0~1). 색상(hue)과 무관하다(TC-EDIT-035).
  static double chroma(int r, int g, int b) {
    final hi = math.max(r, math.max(g, b));
    final lo = math.min(r, math.min(g, b));
    return (hi - lo) / 255;
  }

  /// 피부색 판정: R >= G >= B, R >= 0.2, (R-B)/R가 0.1~0.6, 색상 0~50도.
  static bool isSkin(int r, int g, int b) {
    if (!(r >= g && g >= b)) return false;
    if (r / 255 < 0.2) return false;
    final ratio = (r - b) / r;
    if (ratio < 0.1 || ratio > 0.6) return false;
    final hue = r == b ? 0.0 : 60.0 * (g - b) / (r - b);
    return hue >= 0 && hue <= 50;
  }
}
