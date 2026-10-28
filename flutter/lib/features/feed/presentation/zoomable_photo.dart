import 'package:flutter/material.dart';

import '../domain/photo_zoom.dart';

/// 핀치로 1배~4배까지 확대하는 사진 영역(REQ-FEED-011·012). 손을 떼면 원래 크기로 돌아온다.
/// 계산은 [PhotoZoom]이 하고 이 위젯은 제스처와 복귀 애니메이션만 맡는다.
/// [child]는 사진과 그 위에 겹친 사인이다(함께 확대된다).
class ZoomablePhoto extends StatefulWidget {
  const ZoomablePhoto({super.key, required this.child});

  final Widget child;

  @override
  State<ZoomablePhoto> createState() => _ZoomablePhotoState();
}

class _ZoomablePhotoState extends State<ZoomablePhoto>
    with SingleTickerProviderStateMixin {
  static const Duration _releaseDuration = Duration(milliseconds: 200);

  late final AnimationController _release = AnimationController(
    vsync: this,
    duration: _releaseDuration,
  )..addListener(_onReleaseTick);

  double _scale = PhotoZoom.minScale;
  Offset _offset = Offset.zero;

  // 제스처 시작 때의 값.
  Offset _focalStart = Offset.zero;
  Offset _offsetStart = Offset.zero;
  double _scaleStart = PhotoZoom.minScale;

  // 복귀 애니메이션의 출발 값.
  double _releaseScale = PhotoZoom.minScale;
  Offset _releaseOffset = Offset.zero;

  Size _viewport = Size.zero;

  @override
  void dispose() {
    _release.dispose();
    super.dispose();
  }

  void _onScaleStart(ScaleStartDetails details) {
    _release.stop();
    _focalStart = details.localFocalPoint;
    _offsetStart = _offset;
    _scaleStart = _scale;
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    final scale = PhotoZoom.clampScale(_scaleStart * details.scale);
    setState(() {
      _scale = scale;
      _offset = PhotoZoom.anchoredOffset(
        focalStart: _focalStart,
        offsetStart: _offsetStart,
        scaleStart: _scaleStart,
        focalNow: details.localFocalPoint,
        scaleNow: scale,
        viewport: _viewport,
      );
    });
  }

  void _onScaleEnd(ScaleEndDetails details) {
    _releaseScale = _scale;
    _releaseOffset = _offset;
    _release.forward(from: 0);
  }

  void _onReleaseTick() {
    final t = Curves.easeOut.transform(_release.value);
    setState(() {
      _scale = _releaseScale + (PhotoZoom.minScale - _releaseScale) * t;
      _offset = Offset.lerp(_releaseOffset, Offset.zero, t)!;
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _viewport = constraints.biggest;
        return GestureDetector(
          onScaleStart: _onScaleStart,
          onScaleUpdate: _onScaleUpdate,
          onScaleEnd: _onScaleEnd,
          child: ClipRect(
            child: Transform(
              transform: Matrix4.translationValues(_offset.dx, _offset.dy, 0)
                ..scaleByDouble(_scale, _scale, 1, 1),
              child: widget.child,
            ),
          ),
        );
      },
    );
  }
}
