import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import '../domain/image_codec.dart';
import '../domain/rgba_image.dart';

/// `dart:ui` 코덱 기반 [ImageDecoder]. 큰 사진은 목표 크기로 바로 디코드해 전체 해상도 비트맵을
/// 만들지 않는다(TC-UPL-035). 움직이는 이미지는 첫 프레임만 읽는다(TC-UPL-043).
class UiImageDecoder implements ImageDecoder {
  const UiImageDecoder();

  @override
  Future<ImageBounds> readBounds(Uint8List bytes) async {
    if (bytes.isEmpty) throw const ImageDecodeException('empty');
    ui.ImmutableBuffer? buffer;
    ui.ImageDescriptor? descriptor;
    try {
      buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      return ImageBounds(descriptor.width, descriptor.height);
    } on Object catch (error) {
      throw ImageDecodeException('bounds: $error');
    } finally {
      descriptor?.dispose();
      buffer?.dispose();
    }
  }

  @override
  Future<RgbaImage> decode(
    Uint8List bytes, {
    required int width,
    required int height,
  }) async {
    if (bytes.isEmpty) throw const ImageDecodeException('empty');
    ui.Codec? codec;
    ui.Image? image;
    try {
      codec = await ui.instantiateImageCodec(
        bytes,
        targetWidth: width,
        targetHeight: height,
      );
      final frame = await codec.getNextFrame();
      image = frame.image;
      final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (data == null) throw const ImageDecodeException('no pixels');
      return RgbaImage(
        width: image.width,
        height: image.height,
        rgba: data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
    } on ImageDecodeException {
      rethrow;
    } on Object catch (error) {
      throw ImageDecodeException('decode: $error');
    } finally {
      image?.dispose();
      codec?.dispose();
    }
  }
}

/// `dart:ui` 캔버스로 크기를 바꾸는 [ImageScaler](고품질 보간).
class UiImageScaler implements ImageScaler {
  const UiImageScaler();

  @override
  Future<RgbaImage> scale(
    RgbaImage image, {
    required int width,
    required int height,
  }) async {
    if (image.width == width && image.height == height) return image;
    final completer = Completer<ui.Image>();
    ui.decodeImageFromPixels(
      image.rgba,
      image.width,
      image.height,
      ui.PixelFormat.rgba8888,
      completer.complete,
    );
    final source = await completer.future;
    final recorder = ui.PictureRecorder();
    ui.Canvas(recorder).drawImageRect(
      source,
      ui.Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      ui.Paint()..filterQuality = ui.FilterQuality.high,
    );
    final picture = recorder.endRecording();
    final scaled = await picture.toImage(width, height);
    try {
      final data = await scaled.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (data == null) throw const ImageDecodeException('no pixels');
      return RgbaImage(
        width: width,
        height: height,
        rgba: data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
    } finally {
      scaled.dispose();
      source.dispose();
      picture.dispose();
    }
  }
}
