import 'dart:math' as math;
import 'dart:typed_data';

import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/color_pipeline.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:chalkak/features/edit/domain/rgba_image.dart';
import 'package:flutter_test/flutter_test.dart';

/// 허용 오차 [tol] 이내로 같은 R, G, B(알파는 정확히 같다)인지 본다.
Matcher _near(List<int> expected, [int tol = 2]) =>
    predicate<List<int>>((actual) {
      if (actual.length != 4) return false;
      for (var i = 0; i < 3; i++) {
        if ((actual[i] - expected[i]).abs() > tol) return false;
      }
      return actual[3] == (expected.length > 3 ? expected[3] : 255);
    }, '$expected(±$tol)와 같다');

List<int> _px(
  int r,
  int g,
  int b, {
  AdjustmentValues adj = AdjustmentValues.zero,
  PhotoFilter filter = PhotoFilter.original,
  int a = 255,
}) => PhotoColorPipeline.applyPixel(
  [r, g, b, a],
  adjustments: adj,
  filter: filter,
);

List<int> _gray(double exposure) =>
    _px(128, 128, 128, adj: AdjustmentValues(exposure: exposure));

/// 파이썬으로 스펙 식을 그대로 옮겨 구한 4x4 색 패치.
const _patch = <List<int>>[
  [10, 40, 200],
  [47, 131, 253],
  [84, 222, 50],
  [121, 57, 103],
  [158, 148, 156],
  [195, 239, 209],
  [232, 74, 6],
  [13, 165, 59],
  [50, 0, 112],
  [87, 91, 165],
  [124, 182, 218],
  [161, 17, 15],
  [198, 108, 68],
  [235, 199, 121],
  [16, 34, 174],
  [53, 125, 227],
];

const _vintageGolden = <List<int>>[
  [56, 62, 123],
  [116, 141, 176],
  [153, 200, 99],
  [123, 85, 91],
  [183, 164, 144],
  [243, 244, 197],
  [191, 108, 59],
  [89, 146, 81],
  [60, 31, 73],
  [120, 110, 126],
  [179, 190, 180],
  [127, 54, 41],
  [187, 133, 94],
  [247, 213, 148],
  [56, 56, 109],
  [116, 136, 162],
];

const _vividGolden = <List<int>>[
  [0, 38, 254],
  [21, 134, 255],
  [50, 237, 4],
  [137, 51, 113],
  [161, 147, 158],
  [184, 243, 203],
  [255, 64, 0],
  [0, 179, 36],
  [61, 0, 145],
  [84, 89, 189],
  [107, 185, 234],
  [201, 6, 4],
  [224, 102, 48],
  [247, 198, 93],
  [8, 32, 221],
  [31, 128, 255],
];

RgbaImage _patchImage() => RgbaImage(
  width: 4,
  height: 4,
  rgba: Uint8List.fromList([
    for (final c in _patch) ...[c[0], c[1], c[2], 255],
  ]),
);

void main() {
  group('조정 항목 색 변환', () {
    test('TC-EDIT-024 회색 128에 노출 +1, +0.5, -1을 주면 약 205, 162, 78이다(±2)', () {
      expect(_gray(1), _near([205, 205, 205]));
      expect(_gray(0.5), _near([162, 162, 162]));
      expect(_gray(-1), _near([78, 78, 78]));
    });

    test('TC-EDIT-024 노출 0이면 128 그대로다', () {
      expect(_gray(0), [128, 128, 128, 255]);
    });

    test(
      'TC-EDIT-025 회색 128에 따뜻함 +1은 R 142, G 128, B 112, -1은 R 112, B 142다(±2)',
      () {
        expect(
          _px(128, 128, 128, adj: const AdjustmentValues(warmth: 1)),
          _near([142, 128, 112]),
        );
        expect(
          _px(128, 128, 128, adj: const AdjustmentValues(warmth: -1)),
          _near([112, 128, 142]),
        );
      },
    );

    test('TC-EDIT-026 (200, 50, 50)에 채도 -1은 R=G=B=107, +1은 (255, 0, 0), 0은 변화 없다(±2)', () {
      final gray = _px(
        200,
        50,
        50,
        adj: const AdjustmentValues(saturation: -1),
      );
      expect(gray, _near([107, 107, 107]));
      expect(gray[0], gray[1]);
      expect(gray[1], gray[2]);
      expect(
        _px(200, 50, 50, adj: const AdjustmentValues(saturation: 1)),
        _near([255, 0, 0]),
      );
      expect(_px(200, 50, 50), _near([200, 50, 50], 0));
    });

    test('TC-EDIT-029 조정은 알파를 바꾸지 않는다', () {
      final p = _px(
        90,
        160,
        220,
        a: 77,
        adj: const AdjustmentValues(exposure: 0.5, contrast: 0.5),
        filter: PhotoFilter.vintage,
      );
      expect(p[3], 77);
    });
  });

  group('톤 곡선', () {
    test(
      'TC-EDIT-027 대비 +1은 t=0.25 -> 0.1545, 0.5 -> 0.5, 0.75 -> 0.8455다(±0.01)',
      () {
        expect(ToneCurves.contrast(0.25, 1), closeTo(0.1545, 0.01));
        expect(ToneCurves.contrast(0.5, 1), closeTo(0.5, 0.01));
        expect(ToneCurves.contrast(0.75, 1), closeTo(0.8455, 0.01));
      },
    );

    test(
      'TC-EDIT-027 그림자 +1은 1/3 -> 0.4815, 하이라이트 +1은 2/3 -> 0.8148이다(±0.01)',
      () {
        expect(ToneCurves.shadows(1 / 3, 1), closeTo(0.4815, 0.01));
        expect(ToneCurves.highlights(2 / 3, 1), closeTo(0.8148, 0.01));
      },
    );

    test('TC-EDIT-027 값이 0이면 곡선은 변하지 않는다', () {
      for (final t in [0.0, 0.2, 0.5, 0.9, 1.0]) {
        expect(ToneCurves.shadows(t, 0), closeTo(t, 1e-12));
        expect(ToneCurves.highlights(t, 0), closeTo(t, 1e-12));
        expect(ToneCurves.contrast(t, 0), closeTo(t, 1e-12));
      }
    });

    test('TC-EDIT-027 블랙 포인트 -1에서 검정은 약 0.3까지 뜬다', () {
      final table = ToneCurves.table(blackPoint: -1);
      expect(table, hasLength(256));
      expect(table.first, closeTo(0.3, 0.01));
      expect(table.last, closeTo(1, 1e-9));
    });

    test('TC-EDIT-027 블랙 포인트 +1에서 밝기 0.3 아래는 0이다', () {
      final table = ToneCurves.table(blackPoint: 1);
      for (var i = 0; i <= 76; i++) {
        expect(table[i], closeTo(0, 0.01), reason: '$i칸');
      }
      expect(table.last, closeTo(1, 1e-9));
    });

    test('TC-EDIT-028 값 조합 (-1, 0, 1)^4 81가지 모두 끝이 1이고 줄어들지 않는 256칸 표다', () {
      const values = [-1.0, 0.0, 1.0];
      for (final bp in values) {
        for (final sh in values) {
          for (final hi in values) {
            for (final co in values) {
              final t = ToneCurves.table(
                blackPoint: bp,
                shadows: sh,
                highlights: hi,
                contrast: co,
              );
              final why = 'bp=$bp sh=$sh hi=$hi co=$co';
              expect(t, hasLength(256), reason: why);
              // 첫 칸은 블랙 포인트가 음수일 때만 띄운 최소값(0.3 x -bp)이고 나머지는 0이다.
              expect(
                t.first,
                closeTo(0.3 * math.max(-bp, 0), 1e-9),
                reason: why,
              );
              expect(t.last, closeTo(1, 1e-9), reason: why);
              for (var i = 1; i < 256; i++) {
                expect(
                  t[i],
                  greaterThanOrEqualTo(t[i - 1]),
                  reason: '$why $i칸',
                );
                expect(t[i], inInclusiveRange(0, 1), reason: why);
              }
            }
          }
        }
      }
    });
  });

  group('처리 순서와 항등', () {
    test('TC-EDIT-029 모든 조정 0이고 필터 원본이면 모든 픽셀이 변하지 않는다', () {
      for (final c in _patch) {
        expect(_px(c[0], c[1], c[2]), [c[0], c[1], c[2], 255]);
      }
      final image = _patchImage();
      final out = PhotoColorPipeline.apply(image);
      expect(out.rgba, image.rgba);
    });

    test('TC-EDIT-029 순서: 선형(노출·채도) -> 감마 -> 톤 -> 필터. (200,50,50) 노출 .5 채도 -.5 빈티지 -> (195,138,116)', () {
      const adj = AdjustmentValues(exposure: 0.5, saturation: -0.5);
      expect(_px(200, 50, 50, adj: adj), _near([205, 108, 108]));
      expect(
        _px(200, 50, 50, adj: adj, filter: PhotoFilter.vintage),
        _near([195, 138, 116]),
      );
    });

    test('TC-EDIT-029 대비·그림자·따뜻함 조합 (90,160,220) -> (110,182,222), 빈티지까지 -> (171,188,180)', () {
      const adj = AdjustmentValues(contrast: 0.5, shadows: 0.5, warmth: 0.5);
      expect(_px(90, 160, 220, adj: adj), _near([110, 182, 222]));
      expect(
        _px(90, 160, 220, adj: adj, filter: PhotoFilter.vintage),
        _near([171, 188, 180]),
      );
    });

    test('TC-EDIT-029 노출을 올린 뒤 흑백: 회색 128 노출 +1 흑백은 205다', () {
      expect(
        _px(
          128,
          128,
          128,
          adj: const AdjustmentValues(exposure: 1),
          filter: PhotoFilter.mono,
        ),
        _near([205, 205, 205]),
      );
    });
  });

  group('필터', () {
    test('TC-EDIT-040 원본 필터는 모든 픽셀을 바꾸지 않고 이미지 크기를 유지한다', () {
      final out = PhotoColorPipeline.apply(
        _patchImage(),
        filter: PhotoFilter.original,
      );
      expect(out.rgba, _patchImage().rgba);
      expect((out.width, out.height), (4, 4));
    });

    test('TC-EDIT-040 필터를 적용해도 이미지 원래 크기가 유지된다', () {
      for (final f in PhotoFilter.values) {
        final out = PhotoColorPipeline.apply(_patchImage(), filter: f);
        expect((out.width, out.height), (4, 4), reason: f.name);
        expect(out.rgba, hasLength(64), reason: f.name);
      }
    });

    test('TC-EDIT-041 흑백 필터는 임의 색 이미지의 모든 픽셀에서 R=G=B다', () {
      final out = PhotoColorPipeline.apply(
        _patchImage(),
        filter: PhotoFilter.mono,
      );
      for (var i = 0; i < 16; i++) {
        final p = out.pixelAt(i % 4, i ~/ 4);
        expect(p[0], p[1], reason: '$i번 픽셀');
        expect(p[1], p[2], reason: '$i번 픽셀');
        expect(p[3], 255);
      }
    });

    test('TC-EDIT-042 회색 128에 따뜻하게는 R>B, 차갑게는 B>R이다', () {
      final warm = _px(128, 128, 128, filter: PhotoFilter.warm);
      final cool = _px(128, 128, 128, filter: PhotoFilter.cool);
      expect(warm[0], greaterThan(warm[2]));
      expect(cool[2], greaterThan(cool[0]));
    });

    test('TC-EDIT-043 고정 4x4 색 패치에 빈티지를 적용하면 골든 값과 ±2 이내다', () {
      final out = PhotoColorPipeline.apply(
        _patchImage(),
        filter: PhotoFilter.vintage,
      );
      for (var i = 0; i < 16; i++) {
        expect(
          out.pixelAt(i % 4, i ~/ 4),
          _near(_vintageGolden[i]),
          reason: '$i번 픽셀 ${_patch[i]}',
        );
      }
    });

    test('TC-EDIT-043 고정 4x4 색 패치에 선명하게를 적용하면 골든 값과 ±2 이내다', () {
      final out = PhotoColorPipeline.apply(
        _patchImage(),
        filter: PhotoFilter.vivid,
      );
      for (var i = 0; i < 16; i++) {
        expect(
          out.pixelAt(i % 4, i ~/ 4),
          _near(_vividGolden[i]),
          reason: '$i번 픽셀 ${_patch[i]}',
        );
      }
    });

    test('TC-EDIT-044 이미지 전체에 입히는 경로와 한 픽셀씩 계산하는 경로가 같은 필터에서 ±1 이내로 같다', () {
      for (final f in PhotoFilter.values) {
        final whole = PhotoColorPipeline.apply(_patchImage(), filter: f);
        for (var i = 0; i < 16; i++) {
          final one = PhotoColorPipeline.applyPixel([
            ..._patch[i],
            255,
          ], filter: f);
          expect(
            whole.pixelAt(i % 4, i ~/ 4),
            _near(one, 1),
            reason: '${f.name} $i번 픽셀',
          );
        }
      }
    });

    test('TC-EDIT-044 조정을 0으로 명시해도 생략한 경로와 같은 결과다', () {
      final a = PhotoColorPipeline.apply(
        _patchImage(),
        filter: PhotoFilter.vivid,
      );
      final b = PhotoColorPipeline.apply(
        _patchImage(),
        adjustments: const AdjustmentValues(),
        filter: PhotoFilter.vivid,
      );
      expect(b.rgba, a.rgba);
    });
  });
}
