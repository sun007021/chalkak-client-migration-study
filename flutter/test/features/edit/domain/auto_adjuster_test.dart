import 'dart:typed_data';

import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/auto_adjuster.dart';
import 'package:chalkak/features/edit/domain/rgba_image.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart' show pixelImage;

const _adjuster = AutoAdjuster();

int _c(double v) => (v * 255).round();

RgbaImage _solid(double r, double g, double b) =>
    RgbaImage.solid(8, 8, r: _c(r), g: _c(g), b: _c(b));

/// 256칸 회색 그라디언트(16x16, 픽셀 i의 값은 map(i)).
RgbaImage _grayRamp(int Function(int i) map) => pixelImage(16, 16, (x, y) {
  final v = map(y * 16 + x);
  return [v, v, v];
});

void main() {
  group('자동 채도 (단색 사진)', () {
    test('TC-EDIT-034 밝은 피부 (0.94, 0.78, 0.69)는 자동 채도 0이다', () async {
      final v = await _adjuster.analyze(_solid(0.94, 0.78, 0.69));
      expect(v.saturation, closeTo(0, 0.01));
    });

    test('TC-EDIT-034 어두운 피부 (0.45, 0.30, 0.22)는 자동 채도 0이다', () async {
      final v = await _adjuster.analyze(_solid(0.45, 0.30, 0.22));
      expect(v.saturation, closeTo(0, 0.01));
    });

    test('TC-EDIT-034 하늘 (0.53, 0.81, 0.92)는 +19(화면 값), 풀 (0.30, 0.60, 0.20)은 +18이다(±1)', () async {
      final sky = await _adjuster.analyze(_solid(0.53, 0.81, 0.92));
      expect(sky.saturation * 100, closeTo(19, 1));
      final grass = await _adjuster.analyze(_solid(0.30, 0.60, 0.20));
      expect(grass.saturation * 100, closeTo(18, 1));
    });

    test('TC-EDIT-034 일부(1/4)만 피부색이면 올릴 양의 3/4만 올린다', () async {
      final skin = [_c(0.94), _c(0.78), _c(0.69)];
      final sky = [_c(0.53), _c(0.81), _c(0.92)];
      final mixed = pixelImage(4, 4, (x, y) => y == 0 ? skin : sky);
      final v = await _adjuster.analyze(mixed);
      // 하늘 단색은 +0.19(= 0.186 반올림 전). 3/4는 0.1395 -> 0.14.
      expect(v.saturation * 100, closeTo(14, 1));
    });

    test('REQ-EDIT-026 각 값은 소수 둘째 자리로 반올림돼 있다', () async {
      final v = await _adjuster.analyze(_solid(0.53, 0.81, 0.92));
      expect(v.saturation * 100, closeTo((v.saturation * 100).round(), 1e-9));
    });
  });

  group('채도 세기와 피부색 판정', () {
    test('TC-EDIT-035 채도 세기는 가장 큰 채널 - 가장 작은 채널이라 색상(hue)과 무관하다', () {
      // 최대 200, 최소 50이고 가운데 값만 바꿔 색상을 돌린다. 채널 순서도 모두 바꿔 본다.
      final expected = (200 - 50) / 255;
      for (var mid = 50; mid <= 200; mid += 25) {
        for (final c in [
          [200, mid, 50],
          [200, 50, mid],
          [mid, 200, 50],
          [50, 200, mid],
          [mid, 50, 200],
          [50, mid, 200],
        ]) {
          expect(
            AutoAdjuster.chroma(c[0], c[1], c[2]),
            closeTo(expected, 1e-9),
            reason: '$c',
          );
        }
      }
    });

    test('TC-EDIT-035 회색은 0, 순색은 1이다', () {
      expect(AutoAdjuster.chroma(128, 128, 128), 0);
      expect(AutoAdjuster.chroma(255, 0, 0), 1);
      expect(AutoAdjuster.chroma(0, 255, 0), 1);
    });

    test('TC-EDIT-034 피부색 판정: R>=G>=B, R>=0.2, (R-B)/R 0.1~0.6, 색상 0~50도', () {
      expect(AutoAdjuster.isSkin(_c(0.94), _c(0.78), _c(0.69)), isTrue);
      expect(AutoAdjuster.isSkin(_c(0.45), _c(0.30), _c(0.22)), isTrue);
      expect(AutoAdjuster.isSkin(_c(0.53), _c(0.81), _c(0.92)), isFalse);
      expect(AutoAdjuster.isSkin(_c(0.30), _c(0.60), _c(0.20)), isFalse);
      // R이 0.2 미만
      expect(AutoAdjuster.isSkin(40, 30, 20), isFalse);
      // (R-B)/R가 0.1 미만(거의 회색)
      expect(AutoAdjuster.isSkin(200, 195, 190), isFalse);
      // (R-B)/R가 0.6 초과
      expect(AutoAdjuster.isSkin(200, 60, 40), isFalse);
      // 색상 50도 초과(노란 쪽)
      expect(AutoAdjuster.isSkin(200, 190, 80), isFalse);
    });
  });

  group('자동 보정 분석', () {
    test('TC-EDIT-033 대비가 낮고 뜬 사진은 블랙 포인트·대비·노출을 올려 밝기 범위를 넓힌다', () async {
      // 밝기 100~160만 쓰는 흐릿한 회색 그라디언트.
      final v = await _adjuster.analyze(_grayRamp((i) => 100 + i * 60 ~/ 255));
      expect(v.exposure, greaterThan(0.3));
      expect(v.blackPoint, greaterThan(0.3));
      expect(v.contrast, greaterThan(0.2));
      expect(v.exposure, closeTo(0.56, 0.06));
      expect(v.blackPoint, closeTo(0.83, 0.06));
      expect(v.contrast, closeTo(0.4, 0.06));
      expect(v.warmth, 0, reason: '따뜻함은 정하지 않는다');
    });

    test(
      'TC-EDIT-033 밝기가 고른 사진은 노출·블랙 포인트·대비는 건드리지 않고 그림자·하이라이트만 조금 정한다',
      () async {
        final v = await _adjuster.analyze(_grayRamp((i) => i));
        expect(v.exposure, 0);
        expect(v.blackPoint, 0);
        expect(v.contrast, 0);
        expect(v.shadows, closeTo(0.20, 0.02));
        expect(v.highlights, closeTo(-0.31, 0.02));
        for (final item in AdjustItem.values.where((i) => i.isValue)) {
          expect(v.of(item).abs(), lessThanOrEqualTo(0.5), reason: item.name);
        }
      },
    );

    test('TC-EDIT-033 흑백 사진은 채도를 올리지 않는다', () async {
      final v = await _adjuster.analyze(_grayRamp((i) => 100 + i * 60 ~/ 255));
      expect(v.saturation, 0);
      final ramp = await _adjuster.analyze(_grayRamp((i) => i));
      expect(ramp.saturation, 0);
    });

    test('REQ-EDIT-027 분석할 수 없는 영역(빈 이미지)은 아무것도 바꾸지 않는다', () async {
      final empty = RgbaImage(width: 0, height: 0, rgba: Uint8List(0));
      expect(await _adjuster.analyze(empty), AdjustmentValues.zero);
    });
  });
}
