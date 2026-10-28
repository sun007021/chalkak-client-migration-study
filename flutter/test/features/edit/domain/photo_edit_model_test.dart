import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/crop_aspect_ratio.dart';
import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/edit/domain/photo_edit_constants.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:flutter_test/flutter_test.dart';

/// 스펙 부록 "필터 4x5 행렬"의 값. 행: 결과 R, G, B, A / 열: 입력 R, G, B, A, 더하는 값.
const _mono = [
  [0.299, 0.587, 0.114, 0, 0],
  [0.299, 0.587, 0.114, 0, 0],
  [0.299, 0.587, 0.114, 0, 0],
  [0, 0, 0, 1, 0],
];
const _warm = [
  [1.08, 0, 0, 0, 8],
  [0, 1.02, 0, 0, 4],
  [0, 0, 0.88, 0, 0],
  [0, 0, 0, 1, 0],
];
const _cool = [
  [0.9, 0, 0, 0, 0],
  [0, 1, 0, 0, 2],
  [0, 0, 1.1, 0, 10],
  [0, 0, 0, 1, 0],
];
const _vintage = [
  [0.63, 0.35, 0.09, 0, 18],
  [0.16, 0.76, 0.08, 0, 14],
  [0.12, 0.24, 0.51, 0, 10],
  [0, 0, 0, 1, 0],
];
const _vivid = [
  [1.2754, -0.2503, -0.0252, 0, 0],
  [-0.0746, 1.0997, -0.0252, 0, 0],
  [-0.0746, -0.2503, 1.3248, 0, 0],
  [0, 0, 0, 1, 0],
];

List<double> _flat(List<List<num>> rows) => [
  for (final r in rows)
    for (final v in r) v.toDouble(),
];

/// 저장소 루트의 공유 필터 파일. 아직 없으면 null이어서 해당 비교만 건너뛴다.
File? _sharedFiltersFile() {
  var dir = Directory.current;
  for (var i = 0; i < 4; i++) {
    final f = File('${dir.path}/shared/photo-edit/filters.json');
    if (f.existsSync()) return f;
    dir = dir.parent;
  }
  return null;
}

void main() {
  group('편집값 모델', () {
    test('REQ-EDIT-005 TC-EDIT-011 아무것도 바꾸지 않은 편집값은 isIdentity다', () {
      expect(PhotoEdit.identity.isIdentity, isTrue);
      expect(const PhotoEdit().isIdentity, isTrue);
      expect(PhotoEdit.identity.crop, CropWindow.full);
      expect(PhotoEdit.identity.filter, PhotoFilter.original);
    });

    test(
      'REQ-EDIT-005 TC-EDIT-011 회전·자르기·필터·조정 중 하나라도 바뀌면 isIdentity가 아니다',
      () {
        expect(const PhotoEdit(quarterTurns: 1).isIdentity, isFalse);
        expect(
          const PhotoEdit(
            crop: CropWindow(centerX: 0.5, centerY: 0.5, width: 0.9, height: 1),
          ).isIdentity,
          isFalse,
        );
        expect(const PhotoEdit(filter: PhotoFilter.mono).isIdentity, isFalse);
        expect(
          const PhotoEdit(
            adjustments: AdjustmentLayers(userValues: {AdjustItem.warmth: 0.1}),
          ).isIdentity,
          isFalse,
        );
      },
    );

    test('REQ-EDIT-005 적용되는 조정 값이 0이면(자동 강도 0, 분석값만 있음) 편집하지 않은 사진이다', () {
      const analyzedButOff = PhotoEdit(
        adjustments: AdjustmentLayers(
          autoValues: AdjustmentValues(exposure: 0.4),
        ),
      );
      expect(analyzedButOff.isIdentity, isTrue);
    });

    test('REQ-EDIT-005 자동 보정 강도를 올려 적용 값이 0이 아니면 편집한 사진이다', () {
      const on = PhotoEdit(
        adjustments: AdjustmentLayers(
          autoValues: AdjustmentValues(exposure: 0.4),
          autoStrength: 1,
        ),
      );
      expect(on.isIdentity, isFalse);
    });

    test('TC-EDIT-021 수평 보정 값은 편집값을 어떻게 만들어도 항상 0이다', () {
      expect(PhotoEdit.identity.straightenDegrees, 0);
      expect(const PhotoEdit(quarterTurns: 3).straightenDegrees, 0);
      expect(
        PhotoEdit.identity
            .copyWith(filter: PhotoFilter.vivid)
            .straightenDegrees,
        0,
      );
    });

    test('copyWith은 지정한 값만 바꾸고 ==/hashCode는 값으로 비교한다', () {
      const a = PhotoEdit(quarterTurns: 2, filter: PhotoFilter.cool);
      final b = a.copyWith(quarterTurns: 2);
      expect(b, a);
      expect(b.hashCode, a.hashCode);
      expect(a.copyWith(quarterTurns: 1).filter, PhotoFilter.cool);
      expect(a.copyWith(filter: PhotoFilter.warm), isNot(a));
    });
  });

  group('자르기 영역', () {
    test('REQ-EDIT-004 전체와 1e-3 이내로 같으면 전체로 본다', () {
      expect(CropWindow.full.isFull(), isTrue);
      expect(
        const CropWindow(
          centerX: 0.5005,
          centerY: 0.4996,
          width: 0.9995,
          height: 1,
        ).isFull(),
        isTrue,
      );
    });

    test('REQ-EDIT-004 1e-3보다 크게 다르면 전체가 아니다', () {
      expect(
        const CropWindow(
          centerX: 0.5,
          centerY: 0.5,
          width: 0.998,
          height: 1,
        ).isFull(),
        isFalse,
      );
      expect(
        const CropWindow(
          centerX: 0.502,
          centerY: 0.5,
          width: 1,
          height: 1,
        ).isFull(),
        isFalse,
      );
    });

    test('REQ-EDIT-004 허용 오차는 인자로 바꿀 수 있다', () {
      const c = CropWindow(centerX: 0.5, centerY: 0.5, width: 0.99, height: 1);
      expect(c.isFull(), isFalse);
      expect(c.isFull(tolerance: 0.02), isTrue);
    });
  });

  group('자르기 비율 목록', () {
    test('TC-EDIT-013 REQ-EDIT-010 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서다', () {
      expect(CropAspectRatio.values.map((r) => r.label).toList(), [
        Copy.editRatioOriginal,
        Copy.editRatioFree,
        Copy.editRatio11,
        Copy.editRatio45,
        Copy.editRatio54,
        Copy.editRatio34,
        Copy.editRatio43,
        Copy.editRatio916,
        Copy.editRatio169,
      ]);
    });

    test('TC-EDIT-013 고정 비율은 세로·가로 짝을 모두 제공한다', () {
      expect(CropAspectRatio.r4x5.rotated, CropAspectRatio.r5x4);
      expect(CropAspectRatio.r5x4.rotated, CropAspectRatio.r4x5);
      expect(CropAspectRatio.r3x4.rotated, CropAspectRatio.r4x3);
      expect(CropAspectRatio.r4x3.rotated, CropAspectRatio.r3x4);
      expect(CropAspectRatio.r9x16.rotated, CropAspectRatio.r16x9);
      expect(CropAspectRatio.r16x9.rotated, CropAspectRatio.r9x16);
      expect(CropAspectRatio.r1x1.rotated, CropAspectRatio.r1x1);
      expect(CropAspectRatio.original.rotated, CropAspectRatio.original);
      expect(CropAspectRatio.free.rotated, CropAspectRatio.free);
    });

    test('TC-EDIT-013 가로/세로 값: 원본·자유는 null, 나머지는 비율 그대로', () {
      expect(CropAspectRatio.original.fixedRatio, isNull);
      expect(CropAspectRatio.free.fixedRatio, isNull);
      expect(CropAspectRatio.r1x1.fixedRatio, 1);
      expect(CropAspectRatio.r4x5.fixedRatio, closeTo(4 / 5, 1e-9));
      expect(CropAspectRatio.r5x4.fixedRatio, closeTo(5 / 4, 1e-9));
      expect(CropAspectRatio.r3x4.fixedRatio, closeTo(3 / 4, 1e-9));
      expect(CropAspectRatio.r4x3.fixedRatio, closeTo(4 / 3, 1e-9));
      expect(CropAspectRatio.r9x16.fixedRatio, closeTo(9 / 16, 1e-9));
      expect(CropAspectRatio.r16x9.fixedRatio, closeTo(16 / 9, 1e-9));
    });
  });

  group('조정 항목 목록', () {
    test(
      'TC-EDIT-023 REQ-EDIT-019 자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 순서다',
      () {
        expect(AdjustItem.values.map((i) => i.label).toList(), [
          Copy.editAdjustAuto,
          Copy.editAdjustExposure,
          Copy.editAdjustContrast,
          Copy.editAdjustHighlights,
          Copy.editAdjustShadows,
          Copy.editAdjustBlackPoint,
          Copy.editAdjustSaturation,
          Copy.editAdjustWarmth,
        ]);
        expect(AdjustItem.auto.isValue, isFalse);
        expect(AdjustItem.values.where((i) => i.isValue), hasLength(7));
      },
    );

    test('TC-EDIT-023 조정 값은 항목별로 읽고 바꾼다(자동은 값 항목이 아니다)', () {
      var v = AdjustmentValues.zero;
      expect(v.isZero, isTrue);
      for (final item in AdjustItem.values.where((i) => i.isValue)) {
        v = v.withItem(item, 0.5);
        expect(v.of(item), 0.5);
      }
      expect(v.isZero, isFalse);
      expect(() => v.of(AdjustItem.auto), throwsArgumentError);
      expect(v.withItem(AdjustItem.exposure, 0).exposure, 0);
      expect(
        const AdjustmentValues(exposure: 0.3),
        const AdjustmentValues(exposure: 0.3),
      );
    });
  });

  group('필터 목록과 행렬', () {
    test('TC-EDIT-039 REQ-EDIT-028 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 6종이 이 순서다', () {
      expect(PhotoFilter.values.map((f) => f.label).toList(), [
        Copy.editFilterOriginal,
        Copy.editFilterMono,
        Copy.editFilterWarm,
        Copy.editFilterCool,
        Copy.editFilterVintage,
        Copy.editFilterVivid,
      ]);
      expect(PhotoFilter.values.first, PhotoFilter.original);
    });

    test('TC-EDIT-039 REQ-EDIT-029 각 필터의 4x5 행렬(20개 값)이 스펙 표와 같다', () {
      expect(PhotoFilter.original.matrix, isNull);
      expect(PhotoFilter.mono.matrix, _flat(_mono));
      expect(PhotoFilter.warm.matrix, _flat(_warm));
      expect(PhotoFilter.cool.matrix, _flat(_cool));
      expect(PhotoFilter.vintage.matrix, _flat(_vintage));
      expect(PhotoFilter.vivid.matrix, _flat(_vivid));
      for (final f in PhotoFilter.values.skip(1)) {
        expect(f.matrix, hasLength(20));
      }
    });

    test(
      'TC-EDIT-039 TC-EDIT-036 shared/photo-edit/filters.json이 있으면 행렬이 같다',
      () {
        final file = _sharedFiltersFile();
        if (file == null) {
          markTestSkipped('shared/photo-edit/filters.json 없음');
          return;
        }
        // 파일 구조는 정해지지 않았으므로 숫자를 모두 펼쳐 행렬 20개 값이 연속으로 들어 있는지 본다.
        final numbers = <double>[];
        void collect(Object? node) {
          if (node is num) numbers.add(node.toDouble());
          if (node is List) node.forEach(collect);
          if (node is Map) node.values.forEach(collect);
        }

        collect(jsonDecode(file.readAsStringSync()));
        bool contains(List<double> m) {
          for (var i = 0; i + m.length <= numbers.length; i++) {
            var same = true;
            for (var k = 0; k < m.length && same; k++) {
              same = (numbers[i + k] - m[k]).abs() < 1e-9;
            }
            if (same) return true;
          }
          return false;
        }

        for (final f in PhotoFilter.values.skip(1)) {
          expect(contains(f.matrix!), isTrue, reason: f.name);
        }
      },
    );
  });

  group('연산 상수', () {
    test('TC-EDIT-036 스펙 부록의 수치 상수와 같다', () {
      expect(PhotoEditConstants.exposureEv, 1.5);
      expect(PhotoEditConstants.warmthGain, 0.25);
      expect(PhotoEditConstants.blackPointRange, 0.3);
      expect(PhotoEditConstants.shadowsAmount, 0.25);
      expect(PhotoEditConstants.highlightsAmount, 0.25);
      expect(PhotoEditConstants.contrastAmount, 0.6);
      expect(PhotoEditConstants.autoSampleLongEdge, 256);
      expect(PhotoEditConstants.autoWhiteTarget, 0.96);
      expect(PhotoEditConstants.autoExposureMinEv, -0.5);
      expect(PhotoEditConstants.autoExposureMaxEv, 1.0);
      expect(PhotoEditConstants.previewLongEdge, 1440);
    });

    test('TC-EDIT-038 눈금자는 단위당 400dp, 50틱이다', () {
      expect(PhotoEditConstants.rulerDpPerUnit, 400);
      expect(PhotoEditConstants.rulerTicks, 50);
    });
  });
}
