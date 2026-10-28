import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import '../domain/rgba_image.dart';

/// [RgbaImage]를 화면용 [ui.Image]로 바꾼다. 픽셀이 없는(크기만 있는) 이미지는 null.
Future<ui.Image?> decodeRgbaImage(RgbaImage image) {
  if (image.width <= 0 ||
      image.height <= 0 ||
      image.rgba.length < image.width * image.height * 4) {
    return Future.value();
  }
  final completer = Completer<ui.Image?>();
  ui.decodeImageFromPixels(
    image.rgba,
    image.width,
    image.height,
    ui.PixelFormat.rgba8888,
    completer.complete,
  );
  return completer.future;
}

/// [RgbaImage]를 [BoxFit]에 맞춰 그린다. 디코드가 끝나기 전에는 [placeholder]를 보여 준다.
class RgbaImageView extends StatefulWidget {
  const RgbaImageView({
    super.key,
    required this.image,
    this.fit = BoxFit.contain,
    this.placeholder = const SizedBox.shrink(),
  });

  final RgbaImage image;
  final BoxFit fit;
  final Widget placeholder;

  @override
  State<RgbaImageView> createState() => _RgbaImageViewState();
}

class _RgbaImageViewState extends State<RgbaImageView> {
  ui.Image? _decoded;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void didUpdateWidget(RgbaImageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.image, widget.image)) _decode();
  }

  Future<void> _decode() async {
    final generation = ++_generation;
    final decoded = await decodeRgbaImage(widget.image);
    if (!mounted || generation != _generation) {
      decoded?.dispose();
      return;
    }
    final old = _decoded;
    setState(() => _decoded = decoded);
    // 새 이미지가 그려진 다음 프레임에 이전 것을 놓는다.
    if (old != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    }
  }

  @override
  void dispose() {
    _generation++;
    _decoded?.dispose();
    _decoded = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final decoded = _decoded;
    if (decoded == null) return widget.placeholder;
    return RawImage(image: decoded, fit: widget.fit);
  }
}
