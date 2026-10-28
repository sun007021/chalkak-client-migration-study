import 'dart:math' as math;
import 'dart:typed_data';

import 'adjustment.dart';
import 'photo_edit_constants.dart';
import 'photo_filter.dart';
import 'rgba_image.dart';

/// 톤 곡선 구성 함수(부록 "조정 항목 상수"). 입력·출력은 0~1 저장 값 t.
abstract final class ToneCurves {
  /// 그림자: `t += v x 0.25 x 4 x t x (1 - t)^2`.
  static double shadows(double t, double v) =>
      t + v * PhotoEditConstants.shadowsAmount * 4 * t * (1 - t) * (1 - t);

  /// 하이라이트: `t += v x 0.25 x 4 x t^2 x (1 - t)`.
  static double highlights(double t, double v) =>
      t + v * PhotoEditConstants.highlightsAmount * 4 * t * t * (1 - t);

  /// 대비: `t -= v x 0.6 x sin(2 pi t) / (2 pi)`.
  static double contrast(double t, double v) =>
      t -
      v *
          PhotoEditConstants.contrastAmount *
          math.sin(2 * math.pi * t) /
          (2 * math.pi);

  /// 256칸 톤 곡선 표. 블랙 포인트 -> 그림자 -> 하이라이트 -> 대비 순서로 t를 갱신하고
  /// 누적 최대값을 취해 줄어들지 않게 한다. 첫 칸은 outputBlack, 마지막 칸은 1이다.
  static List<double> table({
    double blackPoint = 0,
    double shadows = 0,
    double highlights = 0,
    double contrast = 0,
  }) {
    final inputBlack =
        math.max(blackPoint, 0) * PhotoEditConstants.blackPointRange;
    final outputBlack =
        math.max(-blackPoint, 0) * PhotoEditConstants.blackPointRange;
    final out = List<double>.filled(256, 0);
    var running = 0.0;
    for (var i = 0; i < 256; i++) {
      final x = i / 255;
      var t = ((x - inputBlack) / (1 - inputBlack)).clamp(0.0, 1.0);
      t = ToneCurves.shadows(t, shadows);
      t = ToneCurves.highlights(t, highlights);
      t = ToneCurves.contrast(t, contrast);
      var y = outputBlack + (1 - outputBlack) * t.clamp(0.0, 1.0);
      if (i == 255) y = 1;
      if (y < running) y = running;
      running = y;
      out[i] = y;
    }
    return out;
  }
}

/// sRGB 변환 표. 저장 -> 선형은 256칸, 선형 -> 저장은 보간하는 촘촘한 표.
abstract final class _Srgb {
  static final Float64List toLinear = _buildToLinear();
  static const int _fromSize = 8192;
  static final Float64List fromLinearTable = _buildFromLinear();

  static double linearOf(double x) =>
      x <= 0.04045 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();

  static double storedOf(double x) => x <= 0.0031308
      ? 12.92 * x
      : 1.055 * math.pow(x, 1 / 2.4).toDouble() - 0.055;

  static Float64List _buildToLinear() {
    final t = Float64List(256);
    for (var i = 0; i < 256; i++) {
      t[i] = linearOf(i / 255);
    }
    return t;
  }

  static Float64List _buildFromLinear() {
    final t = Float64List(_fromSize + 1);
    for (var i = 0; i <= _fromSize; i++) {
      t[i] = storedOf(i / _fromSize);
    }
    return t;
  }

  /// 0~1로 자른 선형 값을 저장 값으로(표 보간).
  static double fromLinear(double x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    final pos = x * _fromSize;
    final i = pos.floor();
    final f = pos - i;
    final a = fromLinearTable[i];
    return a + (fromLinearTable[i + 1] - a) * f;
  }
}

/// 조정 + 필터를 한 번 준비해 두고 픽셀들에 되풀이해 적용한다.
class _ColorOp {
  _ColorOp(AdjustmentValues adj, PhotoFilter filter)
    : _filter = filter.matrix,
      _hasAdjust = !adj.isZero,
      _gain = math
          .pow(2, PhotoEditConstants.exposureEv * adj.exposure)
          .toDouble(),
      _warmR = 1 + PhotoEditConstants.warmthGain * adj.warmth,
      _warmB = 1 - PhotoEditConstants.warmthGain * adj.warmth,
      _sat = 1 + adj.saturation,
      _tone =
          (adj.blackPoint != 0 ||
              adj.shadows != 0 ||
              adj.highlights != 0 ||
              adj.contrast != 0)
          ? ToneCurves.table(
              blackPoint: adj.blackPoint,
              shadows: adj.shadows,
              highlights: adj.highlights,
              contrast: adj.contrast,
            )
          : null;

  final List<double>? _filter;
  final bool _hasAdjust;
  final double _gain;
  final double _warmR;
  final double _warmB;
  final double _sat;
  final List<double>? _tone;

  bool get isNoop => !_hasAdjust && _filter == null;

  double _toneOf(double x) {
    final table = _tone;
    if (table == null) return x;
    final pos = x.clamp(0.0, 1.0) * 255;
    final i = pos.floor();
    if (i >= 255) return table[255];
    final f = pos - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  }

  /// [src]의 한 픽셀(오프셋 [o])을 [dst]의 같은 오프셋에 쓴다.
  void applyAt(Uint8List src, Uint8List dst, int o) {
    var r = src[o].toDouble();
    var g = src[o + 1].toDouble();
    var b = src[o + 2].toDouble();
    final a = src[o + 3].toDouble();
    if (_hasAdjust) {
      var lr = _Srgb.toLinear[src[o]] * _gain * _warmR;
      var lg = _Srgb.toLinear[src[o + 1]] * _gain;
      var lb = _Srgb.toLinear[src[o + 2]] * _gain * _warmB;
      if (_sat != 1) {
        final l = 0.2125 * lr + 0.7154 * lg + 0.0721 * lb;
        lr = l + _sat * (lr - l);
        lg = l + _sat * (lg - l);
        lb = l + _sat * (lb - l);
      }
      r = _toneOf(_Srgb.fromLinear(lr)) * 255;
      g = _toneOf(_Srgb.fromLinear(lg)) * 255;
      b = _toneOf(_Srgb.fromLinear(lb)) * 255;
    }
    final m = _filter;
    if (m == null) {
      dst[o] = r.round().clamp(0, 255);
      dst[o + 1] = g.round().clamp(0, 255);
      dst[o + 2] = b.round().clamp(0, 255);
      dst[o + 3] = a.round();
      return;
    }
    dst[o] = (r * m[0] + g * m[1] + b * m[2] + a * m[3] + m[4]).round().clamp(
      0,
      255,
    );
    dst[o + 1] = (r * m[5] + g * m[6] + b * m[7] + a * m[8] + m[9])
        .round()
        .clamp(0, 255);
    dst[o + 2] = (r * m[10] + g * m[11] + b * m[12] + a * m[13] + m[14])
        .round()
        .clamp(0, 255);
    dst[o + 3] = (r * m[15] + g * m[16] + b * m[17] + a * m[18] + m[19])
        .round()
        .clamp(0, 255);
  }
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
  }) {
    final src = Uint8List.fromList(rgba);
    final dst = Uint8List(4);
    _ColorOp(adjustments, filter).applyAt(src, dst, 0);
    return dst.toList();
  }

  /// 이미지 전체에 적용한 새 이미지(크기 유지).
  static RgbaImage apply(
    RgbaImage image, {
    AdjustmentValues adjustments = AdjustmentValues.zero,
    PhotoFilter filter = PhotoFilter.original,
  }) {
    final op = _ColorOp(adjustments, filter);
    if (op.isNoop) {
      return RgbaImage(
        width: image.width,
        height: image.height,
        rgba: Uint8List.fromList(image.rgba),
      );
    }
    final src = image.rgba;
    final dst = Uint8List(src.length);
    for (var o = 0; o < src.length; o += 4) {
      op.applyAt(src, dst, o);
    }
    return RgbaImage(width: image.width, height: image.height, rgba: dst);
  }
}
