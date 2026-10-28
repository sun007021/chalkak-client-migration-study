import 'dart:math' as math;
import 'dart:typed_data';

import 'rgba_image.dart';

/// 디코더가 읽은 크기(px). EXIF 방향을 반영한 값이다(방향 5~8이면 가로세로가 바뀐다).
class ImageBounds {
  const ImageBounds(this.width, this.height);

  final int width;
  final int height;

  int get longEdge => width > height ? width : height;
}

/// 사진 바이트를 읽는 플랫폼 디코더(image_picker가 준 JPEG/PNG/HEIC 등).
/// 큰 사진은 전체 해상도 비트맵을 한 번도 만들지 않고 목표 크기로 바로 디코드한다(TC-UPL-035).
abstract interface class ImageDecoder {
  /// 픽셀을 만들지 않고 크기만 읽는다. 비었거나 손상되면 [ImageDecodeException].
  Future<ImageBounds> readBounds(Uint8List bytes);

  /// EXIF 방향을 반영해 [width] x [height]로 디코드한다. 움직이는 이미지는 첫 프레임만 쓴다
  /// (TC-UPL-043). 지원하지 않는 형식이면 [ImageDecodeException].
  Future<RgbaImage> decode(
    Uint8List bytes, {
    required int width,
    required int height,
  });
}

/// 이미지 크기 변경(0.85배 축소 라운드에서 쓴다).
abstract interface class ImageScaler {
  Future<RgbaImage> scale(
    RgbaImage image, {
    required int width,
    required int height,
  });
}

class ImageDecodeException implements Exception {
  const ImageDecodeException(this.reason, {this.unsupported = false});

  final String reason;

  /// true면 손상이 아니라 플랫폼 디코더가 지원하지 않는 형식이다(TC-UPL-044).
  final bool unsupported;

  @override
  String toString() => 'ImageDecodeException($reason)';
}

/// 긴 변이 [limit] 이하가 되도록 가로세로 비율을 지키며 줄인다(확대하지 않는다).
/// 편집 원본 불러오기와 업로드 인코딩이 함께 쓴다.
(int, int) fitWithin(int width, int height, int limit) {
  final longEdge = math.max(width, height);
  if (longEdge <= limit) return (width, height);
  final scale = limit / longEdge;
  return (
    math.max(1, (width * scale).round()),
    math.max(1, (height * scale).round()),
  );
}
