import 'dart:math' show Point;

import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:chalkak/features/edit/domain/photo_transform.dart';
import 'package:flutter_test/flutter_test.dart';

const _w = 4000;
const _h = 3000;

void main() {
  group('변환 계산', () {
    test('TC-EDIT-016 4000x3000을 1회 돌린 사진의 왼쪽 절반은 원본 중심 (2000, 2250), CropWindow(0.5, 0.75, 0.5, 1), 출력 1500x4000이다', () {
      final rotated = PhotoTransform.rotatedSize(
        1,
        sourceWidth: _w,
        sourceHeight: _h,
      );
      expect((rotated.width, rotated.height), (3000, 4000));

      // 돌린 사진(3000x4000)의 왼쪽 절반: 중심 (750, 2000) px, 크기 0.5 x 1.
      final center = PhotoTransform.toSource(
        1,
        750,
        2000,
        sourceWidth: _w,
        sourceHeight: _h,
      );
      expect(center, const Point<double>(2000, 2250));

      final crop = PhotoTransform.cropFromRotated(
        1,
        sourceWidth: _w,
        sourceHeight: _h,
        rotatedCenterX: 750,
        rotatedCenterY: 2000,
        widthFraction: 0.5,
        heightFraction: 1,
      );
      expect(crop.centerX, closeTo(0.5, 1e-9));
      expect(crop.centerY, closeTo(0.75, 1e-9));
      expect(crop.width, 0.5);
      expect(crop.height, 1);

      final out = PhotoTransform.outputSize(
        1,
        crop,
        sourceWidth: _w,
        sourceHeight: _h,
      );
      expect((out.width, out.height), (1500, 4000));
    });

    test('TC-EDIT-017 돌린 사진의 점 (xr, yr)을 원본 점으로: 0:(xr,yr), 1:(yr,H-xr), 2:(W-xr,H-yr), 3:(W-yr,xr)', () {
      Point<double> at(int turns) => PhotoTransform.toSource(
        turns,
        100,
        200,
        sourceWidth: _w,
        sourceHeight: _h,
      );
      expect(at(0), const Point<double>(100, 200));
      expect(at(1), const Point<double>(200, 2900));
      expect(at(2), const Point<double>(3900, 2800));
      expect(at(3), const Point<double>(3800, 100));
    });

    test('REQ-EDIT-014 돌린 사진의 크기는 홀수 회전일 때 가로세로가 바뀌고 4회전이면 원상이다', () {
      for (final (turns, w, h) in [
        (0, 4000, 3000),
        (1, 3000, 4000),
        (2, 4000, 3000),
        (3, 3000, 4000),
      ]) {
        final s = PhotoTransform.rotatedSize(
          turns,
          sourceWidth: _w,
          sourceHeight: _h,
        );
        expect((s.width, s.height), (w, h), reason: '$turns회전');
      }
    });

    test('TC-EDIT-020 REQ-EDIT-018 4096 이하로 줄인 4000x3000에서 중앙 25%x25%를 자르면 약 1000x750이다', () {
      // 8000x6000 사진은 먼저 4000x3000으로 줄인 뒤 자른다(줄이기는 인코더가, 자르기 크기는 여기서).
      final out = PhotoTransform.outputSize(
        0,
        const CropWindow(centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25),
        sourceWidth: 4000,
        sourceHeight: 3000,
      );
      expect((out.width, out.height), (1000, 750));
    });

    test('REQ-EDIT-014 크기는 반올림한다(전체 자르기는 돌린 사진 크기 그대로)', () {
      final full = PhotoTransform.outputSize(
        1,
        CropWindow.full,
        sourceWidth: _w,
        sourceHeight: _h,
      );
      expect((full.width, full.height), (3000, 4000));
      final odd = PhotoTransform.outputSize(
        0,
        const CropWindow(
          centerX: 0.5,
          centerY: 0.5,
          width: 0.3333,
          height: 0.5,
        ),
        sourceWidth: 100,
        sourceHeight: 101,
      );
      expect((odd.width, odd.height), (33, 51));
    });
  });
}
