import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/features/signature/data/ui_signature_renderer.dart';
import 'package:chalkak/features/signature/domain/signature_renderer.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/onboarding_fakes.dart';

/// 디코딩한 PNG의 RGBA 픽셀.
class _Decoded {
  _Decoded(this.width, this.height, this.rgba);
  final int width;
  final int height;
  final ByteData rgba;

  int alpha(int x, int y) => rgba.getUint8((y * width + x) * 4 + 3);
  int red(int x, int y) => rgba.getUint8((y * width + x) * 4);
  int green(int x, int y) => rgba.getUint8((y * width + x) * 4 + 1);
  int blue(int x, int y) => rgba.getUint8((y * width + x) * 4 + 2);

  /// alpha > 0인 픽셀의 외곽 박스(없으면 null).
  ({int minX, int maxX, int minY, int maxY})? get inkBounds {
    int? minX, maxX, minY, maxY;
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        if (alpha(x, y) == 0) continue;
        minX = minX == null || x < minX ? x : minX;
        maxX = maxX == null || x > maxX ? x : maxX;
        minY = minY == null || y < minY ? y : minY;
        maxY = maxY == null || y > maxY ? y : maxY;
      }
    }
    if (minX == null) return null;
    return (minX: minX, maxX: maxX!, minY: minY!, maxY: maxY!);
  }

  int get inkPixels {
    var n = 0;
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        if (alpha(x, y) > 0) n++;
      }
    }
    return n;
  }
}

Future<_Decoded> _decode(Uint8List png) async {
  final codec = await ui.instantiateImageCodec(png);
  final frame = await codec.getNextFrame();
  final data = await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
  return _Decoded(frame.image.width, frame.image.height, data!);
}

/// dart:ui 이미지 인코딩은 실제 비동기가 필요하다.
void _renderTest(
  String name,
  Future<void> Function(SignatureRenderer renderer) body,
) {
  testWidgets(name, (tester) async {
    await tester.runAsync(() => body(const UiSignatureRenderer()));
  });
}

void main() {
  const w = AppConstants.signaturePngWidth;
  const h = AppConstants.signaturePngHeight;
  const pad = AppConstants.signaturePadding;
  const half = AppConstants.signatureStrokeWidth / 2;

  _renderTest('TC-SIGN-009 임의의 획의 PNG는 정확히 1024x512다', (r) async {
    for (final d in [
      sampleDrawing(),
      strokeOf([(10, 10), (12, 11)]),
      blankDrawing().startStroke(5, 5),
    ]) {
      final img = await _decode(await r.render(d));
      expect(img.width, 1024);
      expect(img.height, 512);
    }
  });

  _renderTest('TC-SIGN-013 결과는 PNG 시그니처로 시작하는 유효한 PNG다', (r) async {
    final png = await r.render(sampleDrawing());
    expect(png.sublist(0, 8), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    // 디코딩이 되어야 유효하다.
    expect((await _decode(png)).width, w);
  });

  _renderTest('TC-SIGN-010 배경은 alpha 0이고 획은 RGB(255,255,255)에 alpha>0이다', (
    r,
  ) async {
    final img = await _decode(await r.render(sampleDrawing()));
    // 모서리는 패딩 밖이라 항상 배경이다.
    for (final (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]) {
      expect(img.alpha(x, y), 0, reason: '($x,$y)는 투명 배경');
    }
    var ink = 0;
    for (var y = 0; y < h; y += 2) {
      for (var x = 0; x < w; x += 2) {
        if (img.alpha(x, y) == 0) continue;
        ink++;
        // 안티앨리어싱 가장자리도 색은 흰색이다(straight alpha 기준).
        if (img.alpha(x, y) == 255) {
          expect(
            [img.red(x, y), img.green(x, y), img.blue(x, y)],
            [255, 255, 255],
            reason: '($x,$y)',
          );
        }
      }
    }
    expect(ink, greaterThan(100), reason: '획 픽셀이 있어야 한다');
  });

  _renderTest('TC-SIGN-011 한쪽에 몰린 획도 패딩 48px 안쪽(획 두께 반 포함)에 들어온다', (r) async {
    final d = strokeOf([(0, 0), (40, 20), (80, 10)]);
    final b = (await _decode(await r.render(d))).inkBounds!;
    expect(b.minX, greaterThanOrEqualTo(pad - half - 2));
    expect(b.maxX, lessThanOrEqualTo(w - pad + half + 2));
    expect(b.minY, greaterThanOrEqualTo(pad - half - 2));
    expect(b.maxY, lessThanOrEqualTo(h - pad + half + 2));
    // 영역을 최대한 채운다: 한 축은 가장자리까지 간다.
    expect(
      b.minX <= pad + half + 2 || b.minY <= pad + half + 2,
      isTrue,
      reason: '패딩 영역을 채워야 한다',
    );
  });

  _renderTest('TC-SIGN-012 획 두께는 14px다(수평선 중앙 열의 불투명 픽셀 수)', (r) async {
    final d = strokeOf([(50, 100), (350, 100)]);
    final img = await _decode(await r.render(d));
    final x = w ~/ 2;
    var rows = 0;
    for (var y = 0; y < h; y++) {
      if (img.alpha(x, y) > 127) rows++;
    }
    expect(rows, inInclusiveRange(13, 15));
  });

  _renderTest('TC-SIGN-012 획 끝은 둥글다(끝점 모서리에 잉크가 없다)', (r) async {
    final d = strokeOf([(50, 100), (350, 100)]);
    final img = await _decode(await r.render(d));
    final b = img.inkBounds!;
    // 둥근 캡: 끝 열의 높이는 중앙 열보다 훨씬 짧고, 박스 모서리 픽셀은 비어 있다.
    expect(img.alpha(b.minX, b.minY), 0, reason: '왼쪽 위 모서리는 비어야 한다');
    expect(img.alpha(b.maxX, b.maxY), 0, reason: '오른쪽 아래 모서리는 비어야 한다');
  });

  _renderTest('TC-SIGN-012 곡선 획도 끊김 없이 이어진다(점이 성긴 대각선)', (r) async {
    final d = strokeOf([(10, 10), (390, 190)]);
    final img = await _decode(await r.render(d));
    // 중간 지점 근처가 칠해져 있어야 한다.
    final mid = img.inkBounds!;
    final cx = (mid.minX + mid.maxX) ~/ 2;
    final cy = (mid.minY + mid.maxY) ~/ 2;
    expect(img.alpha(cx, cy), greaterThan(0));
  });

  _renderTest('TC-SIGN-002 점 하나는 지름 14px 원으로 화면 중앙에 그려진다', (r) async {
    final d = blankDrawing().startStroke(10, 10);
    final img = await _decode(await r.render(d));
    final b = img.inkBounds!;
    expect(b.maxX - b.minX + 1, inInclusiveRange(13, 16));
    expect(b.maxY - b.minY + 1, inInclusiveRange(13, 16));
    expect((b.minX + b.maxX) / 2, closeTo(w / 2, 1.5));
    expect((b.minY + b.maxY) / 2, closeTo(h / 2, 1.5));
    expect(img.alpha(w ~/ 2, h ~/ 2), 255);
    // 원이다: 박스 모서리는 비어 있다.
    expect(img.alpha(b.minX, b.minY), 0);
  });

  _renderTest('TC-SIGN-011 직선·같은 점 반복 입력도 렌더링이 끝난다', (r) async {
    for (final d in [
      strokeOf([(30, 30), (30, 30), (30, 30)]),
      strokeOf([(200, 10), (200, 190)]),
    ]) {
      final img = await _decode(await r.render(d));
      expect(img.inkPixels, greaterThan(0));
    }
  });

  _renderTest('TC-SIGN-016 수천 포인트의 긴 획도 1 MiB 이하이고 합리적 시간 안에 끝난다', (r) async {
    var d = blankDrawing().startStroke(0, 100);
    for (var i = 1; i <= 5000; i++) {
      final t = i / 5000;
      d = d.addPoint(
        t * canvasW,
        100 + 90 * (i.isEven ? 1 : -1) * (0.3 + 0.7 * ((i * 37) % 100) / 100),
      );
    }
    final sw = Stopwatch()..start();
    final png = await r.render(d);
    sw.stop();
    expect(png.length, lessThanOrEqualTo(AppConstants.signatureMaxBytes));
    expect(sw.elapsed, lessThan(const Duration(seconds: 10)));
    expect(SignatureImageGuard.isWithinLimit(png), isTrue);
  });
}
