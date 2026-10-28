import 'dart:math' show Random;
import 'dart:ui' show Offset, Size;

import 'package:chalkak/features/edit/domain/crop_geometry.dart';
import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:flutter_test/flutter_test.dart';

const _iw = 4000.0;
const _ih = 3000.0;
const _geo = CropGeometry(imageWidth: _iw, imageHeight: _ih);
const _eps = 1e-9;

double _left(CropWindow c) => c.centerX - c.width / 2;
double _right(CropWindow c) => c.centerX + c.width / 2;
double _top(CropWindow c) => c.centerY - c.height / 2;
double _bottom(CropWindow c) => c.centerY + c.height / 2;
double _shortSidePx(CropWindow c) =>
    [c.width * _iw, c.height * _ih].reduce((a, b) => a < b ? a : b);
const _minPx = 0.1 * _ih;

void _expectInside(CropWindow c, {String? reason}) {
  expect(_left(c), greaterThanOrEqualTo(-_eps), reason: reason);
  expect(_top(c), greaterThanOrEqualTo(-_eps), reason: reason);
  expect(_right(c), lessThanOrEqualTo(1 + _eps), reason: reason);
  expect(_bottom(c), lessThanOrEqualTo(1 + _eps), reason: reason);
}

/// [handle]의 반대편 모서리 좌표.
Offset _opposite(CropWindow c, CropHandle handle) => switch (handle) {
  CropHandle.topLeft => Offset(_right(c), _bottom(c)),
  CropHandle.topRight => Offset(_left(c), _bottom(c)),
  CropHandle.bottomLeft => Offset(_right(c), _top(c)),
  CropHandle.bottomRight => Offset(_left(c), _top(c)),
};

void main() {
  group('가장 크게 들어가는 영역', () {
    test('REQ-EDIT-011 비율이 없으면 전체 영역이다', () {
      expect(_geo.largest(null), CropWindow.full);
    });

    test('REQ-EDIT-011 1:1은 짧은 변에 맞춰 가운데에 놓인다(4000x3000 -> 3000x3000)', () {
      final c = _geo.largest(1);
      expect(c.width, closeTo(0.75, 1e-9));
      expect(c.height, closeTo(1, 1e-9));
      expect(c.centerX, closeTo(0.5, 1e-9));
      expect(c.centerY, closeTo(0.5, 1e-9));
    });

    test('REQ-EDIT-011 16:9는 가로를 다 쓰고, 9:16은 세로를 다 쓴다', () {
      final wide = _geo.largest(16 / 9);
      expect(wide.width, closeTo(1, 1e-9));
      expect(wide.height, closeTo(2250 / 3000, 1e-9));
      final tall = _geo.largest(9 / 16);
      expect(tall.height, closeTo(1, 1e-9));
      expect(tall.width, closeTo(1687.5 / 4000, 1e-9));
    });

    test('REQ-EDIT-012 어떤 비율이든 결과의 px 비율이 그 비율이고 사진 안에 있다', () {
      for (final a in [
        1.0,
        4 / 5,
        5 / 4,
        3 / 4,
        4 / 3,
        9 / 16,
        16 / 9,
        4 / 3,
      ]) {
        final c = _geo.largest(a);
        expect((c.width * _iw) / (c.height * _ih), closeTo(a, 1e-6));
        _expectInside(c);
      }
    });
  });

  group('프레임 이동', () {
    const crop = CropWindow(
      centerX: 0.5,
      centerY: 0.5,
      width: 0.5,
      height: 0.5,
    );

    test('TC-EDIT-018 이동은 크기를 바꾸지 않고 가장자리에서 멈춘다', () {
      final right = _geo.move(crop, 0.9, 0);
      expect(right.centerX, closeTo(0.75, 1e-9));
      expect(right.width, 0.5);
      final left = _geo.move(crop, -0.9, 0);
      expect(left.centerX, closeTo(0.25, 1e-9));
      final down = _geo.move(crop, 0, 0.9);
      expect(down.centerY, closeTo(0.75, 1e-9));
      final up = _geo.move(crop, 0, -0.9);
      expect(up.centerY, closeTo(0.25, 1e-9));
    });

    test('TC-EDIT-018 경계 안에서의 이동은 그대로 반영한다', () {
      final c = _geo.move(crop, 0.1, -0.05);
      expect(c.centerX, closeTo(0.6, 1e-9));
      expect(c.centerY, closeTo(0.45, 1e-9));
    });

    test('TC-EDIT-018 무작위 이동 300번 모두 사진 밖으로 나가지 않고 크기가 유지된다', () {
      final rnd = Random(11);
      var c = crop;
      for (var i = 0; i < 300; i++) {
        final next = _geo.move(
          c,
          rnd.nextDouble() * 2.4 - 1.2,
          rnd.nextDouble() * 2.4 - 1.2,
        );
        _expectInside(next, reason: '$i번째');
        expect(next.width, c.width);
        expect(next.height, c.height);
        c = next;
      }
    });
  });

  group('모서리 끌기', () {
    const crop = CropWindow(
      centerX: 0.5,
      centerY: 0.5,
      width: 0.5,
      height: 0.5,
    );

    test('TC-EDIT-018 오른쪽 아래를 크게 끌면 왼쪽 위는 고정이고 사진 가장자리에서 멈춘다', () {
      final c = _geo.dragHandle(crop, CropHandle.bottomRight, 1, 1);
      expect(_left(c), closeTo(0.25, 1e-9));
      expect(_top(c), closeTo(0.25, 1e-9));
      expect(_right(c), closeTo(1, 1e-9));
      expect(_bottom(c), closeTo(1, 1e-9));
    });

    test('TC-EDIT-018 왼쪽 위를 크게 끌면 오른쪽 아래는 고정이고 사진 가장자리에서 멈춘다', () {
      final c = _geo.dragHandle(crop, CropHandle.topLeft, -1, -1);
      expect(_right(c), closeTo(0.75, 1e-9));
      expect(_bottom(c), closeTo(0.75, 1e-9));
      expect(_left(c), closeTo(0, 1e-9));
      expect(_top(c), closeTo(0, 1e-9));
    });

    test('TC-EDIT-018 안쪽으로 크게 끌어도 짧은 변은 사진 짧은 변의 0.1배(300px) 아래로 줄지 않는다', () {
      for (final h in CropHandle.values) {
        final dx = (h == CropHandle.topLeft || h == CropHandle.bottomLeft)
            ? 1.0
            : -1.0;
        final dy = (h == CropHandle.topLeft || h == CropHandle.topRight)
            ? 1.0
            : -1.0;
        final c = _geo.dragHandle(crop, h, dx, dy);
        expect(_shortSidePx(c), closeTo(_minPx, 1e-6), reason: h.name);
        final fixed = _opposite(crop, h);
        final after = _opposite(c, h);
        expect((after - fixed).distance, lessThan(1e-9), reason: h.name);
      }
    });

    test('TC-EDIT-018 고정 비율에서는 끄는 동안 px 비율이 유지된다', () {
      final start = _geo.largest(1);
      final c = _geo.dragHandle(
        start,
        CropHandle.bottomRight,
        -0.2,
        -0.05,
        aspect: 1,
      );
      expect((c.width * _iw) / (c.height * _ih), closeTo(1, 1e-6));
      expect(c.width, lessThan(start.width));
    });

    test(
      'TC-EDIT-018 무작위 끌기 600번: 사진 안, 최소 크기, 고정 비율, 반대편 모서리 고정이 항상 지켜진다',
      () {
        final rnd = Random(2026);
        const aspects = <double?>[
          null,
          1,
          4 / 5,
          5 / 4,
          3 / 4,
          4 / 3,
          9 / 16,
          16 / 9,
        ];
        for (var i = 0; i < 600; i++) {
          final aspect = aspects[rnd.nextInt(aspects.length)];
          var c = aspect == null
              ? CropWindow(
                  centerX: 0.5,
                  centerY: 0.5,
                  width: 0.3 + rnd.nextDouble() * 0.7,
                  height: 0.3 + rnd.nextDouble() * 0.7,
                )
              : _geo.largest(aspect);
          // 첫 영역을 가장자리에 붙지 않게 조금 옮겨 본다.
          c = _geo.move(
            c,
            rnd.nextDouble() * 0.6 - 0.3,
            rnd.nextDouble() * 0.6 - 0.3,
          );
          final handle = CropHandle.values[rnd.nextInt(4)];
          final dx = rnd.nextDouble() * 2.4 - 1.2;
          final dy = rnd.nextDouble() * 2.4 - 1.2;
          final next = _geo.dragHandle(c, handle, dx, dy, aspect: aspect);
          final why = '$i번째 ${handle.name} aspect=$aspect dx=$dx dy=$dy';
          _expectInside(next, reason: why);
          expect(
            _shortSidePx(next),
            greaterThanOrEqualTo(_minPx - 1e-6),
            reason: why,
          );
          if (aspect != null) {
            expect(
              (next.width * _iw) / (next.height * _ih),
              closeTo(aspect, 1e-6),
              reason: why,
            );
          }
          expect(
            (_opposite(next, handle) - _opposite(c, handle)).distance,
            lessThan(1e-9),
            reason: why,
          );
        }
      },
    );
  });

  group('화면 좌표 변환', () {
    const viewport = CropViewport(
      imageSize: Size(3000, 4000),
      boxSize: Size(360, 500),
      handleMargin: 12,
    );

    test('TC-EDIT-019 fitScale은 상자에 맞춰 줄이는 배율이고 사진이 보이는 크기는 그만큼 줄어든다', () {
      expect(viewport.fitScale, closeTo(0.12, 1e-12));
      expect(viewport.displaySize.width, closeTo(360, 1e-9));
      expect(viewport.displaySize.height, closeTo(480, 1e-9));
    });

    test('TC-EDIT-019 자르기 화면 크기는 사진이 보이는 크기에 손잡이 여백만 양쪽으로 더한 크기다', () {
      expect(viewport.viewSize.width, closeTo(384, 1e-9));
      expect(viewport.viewSize.height, closeTo(504, 1e-9));
    });

    test('TC-EDIT-019 상자보다 작은 사진은 확대하지 않는다', () {
      const small = CropViewport(
        imageSize: Size(100, 80),
        boxSize: Size(360, 500),
      );
      expect(small.fitScale, 1);
      expect(small.displaySize, const Size(100, 80));
      expect(small.viewSize, const Size(100, 80));
    });

    test('TC-EDIT-019 비율 -> 화면 -> 비율 왕복 오차는 1e-6 이하다', () {
      final rnd = Random(5);
      for (var i = 0; i < 100; i++) {
        final n = Offset(rnd.nextDouble(), rnd.nextDouble());
        final back = viewport.toNormalized(viewport.toScreen(n));
        expect((back - n).distance, lessThan(1e-6));
      }
    });

    test('TC-EDIT-019 가운데는 손잡이 여백 + 보이는 크기의 절반 위치다', () {
      final p = viewport.toScreen(const Offset(0.5, 0.5));
      expect(p.dx, closeTo(12 + 180, 1e-9));
      expect(p.dy, closeTo(12 + 240, 1e-9));
      expect(viewport.toScreen(Offset.zero), const Offset(12, 12));
    });
  });
}
