import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../../edit/domain/rgba_image.dart';
import '../domain/post_image_encoder.dart';
import '../domain/webp_inspector.dart';

/// `flutter_image_compress`의 네이티브 인코더로 손실 WebP를 만드는 [WebpCompressor].
/// RGBA 픽셀을 PNG로 감싸 넘기고(무손실 중간 형식), EXIF 등 메타데이터는 넣지 않는다.
/// 결과가 RIFF/WEBP 정지 이미지가 아니면 예외를 던진다(플랫폼이 다른 형식을 낼 때를 막는다).
class FlutterWebpCompressor implements WebpCompressor {
  const FlutterWebpCompressor();

  @override
  Future<Uint8List> compress(RgbaImage image, {required int quality}) async {
    final png = await _toPng(image);
    final out = await FlutterImageCompress.compressWithList(
      png,
      minWidth: image.width,
      minHeight: image.height,
      quality: quality,
      format: CompressFormat.webp,
      keepExif: false,
    );
    if (out.isEmpty || !WebpInspector.inspect(out).isUploadable) {
      throw StateError('WebP 인코딩 결과가 올바르지 않습니다');
    }
    return out;
  }

  Future<Uint8List> _toPng(RgbaImage image) async {
    final buffer = await ui.ImmutableBuffer.fromUint8List(image.rgba);
    final descriptor = ui.ImageDescriptor.raw(
      buffer,
      width: image.width,
      height: image.height,
      pixelFormat: ui.PixelFormat.rgba8888,
    );
    final codec = await descriptor.instantiateCodec();
    final frame = await codec.getNextFrame();
    try {
      final data = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('PNG 변환 실패');
      return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } finally {
      frame.image.dispose();
      codec.dispose();
      descriptor.dispose();
      buffer.dispose();
    }
  }
}
