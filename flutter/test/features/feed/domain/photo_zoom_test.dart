import 'dart:ui';

import 'package:chalkak/features/feed/domain/photo_zoom.dart';
import 'package:flutter_test/flutter_test.dart';

const _viewport = Size(400, 300);

void main() {
  group('배율', () {
    test('TC-FEED-046 배율은 1배~4배로 맞춘다', () {
      expect(PhotoZoom.clampScale(0.3), 1);
      expect(PhotoZoom.clampScale(1), 1);
      expect(PhotoZoom.clampScale(2.5), 2.5);
      expect(PhotoZoom.clampScale(4), 4);
      expect(PhotoZoom.clampScale(9), 4);
    });

    test('TC-FEED-046 상수는 1배와 4배다', () {
      expect(PhotoZoom.minScale, 1);
      expect(PhotoZoom.maxScale, 4);
    });
  });

  group('팬 범위', () {
    test('TC-FEED-047 확대한 사진이 뷰포트를 벗어나지 않도록 offset을 제한한다', () {
      expect(
        PhotoZoom.clampOffset(const Offset(50, 40), 2, _viewport),
        Offset.zero,
      );
      expect(
        PhotoZoom.clampOffset(const Offset(-900, -700), 2, _viewport),
        const Offset(-400, -300),
      );
      expect(
        PhotoZoom.clampOffset(const Offset(-100, -50), 2, _viewport),
        const Offset(-100, -50),
      );
      expect(
        PhotoZoom.clampOffset(const Offset(-100, -50), 4, _viewport),
        const Offset(-100, -50),
      );
      expect(
        PhotoZoom.clampOffset(const Offset(-2000, -2000), 4, _viewport),
        const Offset(-1200, -900),
      );
    });

    test('TC-FEED-047 배율 1에서는 어떤 offset도 (0, 0)이다', () {
      expect(
        PhotoZoom.clampOffset(const Offset(-30, 20), 1, _viewport),
        Offset.zero,
      );
    });
  });

  group('확대 중심', () {
    test('TC-FEED-048 손가락 아래 사진 지점이 화면에서 움직이지 않는다', () {
      final offset = PhotoZoom.anchoredOffset(
        focalStart: const Offset(200, 150),
        offsetStart: Offset.zero,
        scaleStart: 1,
        focalNow: const Offset(200, 150),
        scaleNow: 2,
        viewport: _viewport,
      );
      expect(offset, const Offset(-200, -150));
      // 사진 지점 (200,150)이 여전히 화면 (200,150)에 있다.
      expect((const Offset(200, 150) - offset) / 2, const Offset(200, 150));
    });

    test('TC-FEED-048 가장자리에서 확대해도 그 지점이 고정된다', () {
      final offset = PhotoZoom.anchoredOffset(
        focalStart: const Offset(100, 60),
        offsetStart: Offset.zero,
        scaleStart: 1,
        focalNow: const Offset(100, 60),
        scaleNow: 3,
        viewport: _viewport,
      );
      expect(offset, const Offset(-200, -120));
    });

    test('TC-FEED-048 이미 확대한 상태에서 다시 확대해도 같은 사진 지점을 따라간다', () {
      // scale 2, offset (-200,-150)에서 화면 (300,200)이 가리키는 사진 지점 = (250,175)
      final offset = PhotoZoom.anchoredOffset(
        focalStart: const Offset(300, 200),
        offsetStart: const Offset(-200, -150),
        scaleStart: 2,
        focalNow: const Offset(300, 200),
        scaleNow: 3,
        viewport: _viewport,
      );
      expect(offset, const Offset(300 - 250 * 3, 200 - 175 * 3));
    });

    test('TC-FEED-047 두 손가락 팬은 focal 이동만큼 따라가되 범위 안에서만 움직인다', () {
      final moved = PhotoZoom.anchoredOffset(
        focalStart: const Offset(200, 150),
        offsetStart: const Offset(-200, -150),
        scaleStart: 2,
        focalNow: const Offset(230, 170),
        scaleNow: 2,
        viewport: _viewport,
      );
      expect(moved, const Offset(-170, -130));
      final clamped = PhotoZoom.anchoredOffset(
        focalStart: const Offset(200, 150),
        offsetStart: const Offset(-200, -150),
        scaleStart: 2,
        focalNow: const Offset(900, 700),
        scaleNow: 2,
        viewport: _viewport,
      );
      expect(clamped, Offset.zero);
    });

    test('TC-FEED-046 4배를 넘는 제스처 배율은 4배로 맞춰 계산한다', () {
      final offset = PhotoZoom.anchoredOffset(
        focalStart: const Offset(200, 150),
        offsetStart: Offset.zero,
        scaleStart: 1,
        focalNow: const Offset(200, 150),
        scaleNow: 9,
        viewport: _viewport,
      );
      expect(offset, const Offset(200 - 200 * 4, 150 - 150 * 4));
    });
  });
}
