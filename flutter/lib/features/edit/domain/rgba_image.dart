import 'dart:typed_data';

/// 편집·인코딩 파이프라인이 주고받는 픽셀 이미지. 한 픽셀이 R, G, B, A 순서의 바이트 4개이고
/// 행 우선(왼쪽 위부터)이다. EXIF 방향은 이미 반영돼 있다(REQ-EDIT-007).
class RgbaImage {
  RgbaImage({required this.width, required this.height, required this.rgba});

  /// 모든 픽셀이 같은 색인 이미지(테스트·분석용).
  factory RgbaImage.solid(
    int width,
    int height, {
    required int r,
    required int g,
    required int b,
    int a = 255,
  }) => throw UnimplementedError();

  final int width;
  final int height;

  /// 길이는 `width * height * 4`.
  final Uint8List rgba;

  /// (x, y) 픽셀의 [r, g, b, a].
  List<int> pixelAt(int x, int y) => throw UnimplementedError();
}
