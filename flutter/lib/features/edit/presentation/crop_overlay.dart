import 'package:flutter/material.dart';

import '../domain/crop_geometry.dart';
import '../domain/crop_window.dart';

/// 자르기 프레임 그리기와 끌기. 좌표는 돌린 사진 기준 0~1 비율([CropWindow])이고
/// 화면 변환은 [CropViewport], 경계·최소 크기는 [CropGeometry]가 맡는다(REQ-EDIT-013).
class CropOverlay extends StatefulWidget {
  const CropOverlay({
    super.key,
    required this.viewport,
    required this.geometry,
    required this.crop,
    required this.aspect,
    required this.onChanged,
    this.interactive = true,
  });

  final CropViewport viewport;
  final CropGeometry geometry;
  final CropWindow crop;

  /// 고정 비율(가로 / 세로, px). 자유는 null.
  final double? aspect;
  final ValueChanged<CropWindow> onChanged;
  final bool interactive;

  @override
  State<CropOverlay> createState() => _CropOverlayState();
}

enum _Drag { none, move, handle }

class _CropOverlayState extends State<CropOverlay> {
  static const _grab = 28.0;

  _Drag _drag = _Drag.none;
  CropHandle _handle = CropHandle.topLeft;

  Rect _screenRect(CropWindow c) {
    final tl = widget.viewport.toScreen(
      Offset(c.centerX - c.width / 2, c.centerY - c.height / 2),
    );
    final br = widget.viewport.toScreen(
      Offset(c.centerX + c.width / 2, c.centerY + c.height / 2),
    );
    return Rect.fromPoints(tl, br);
  }

  void _start(DragStartDetails details) {
    final rect = _screenRect(widget.crop);
    final p = details.localPosition;
    final corners = {
      CropHandle.topLeft: rect.topLeft,
      CropHandle.topRight: rect.topRight,
      CropHandle.bottomLeft: rect.bottomLeft,
      CropHandle.bottomRight: rect.bottomRight,
    };
    CropHandle? hit;
    var best = _grab;
    corners.forEach((handle, point) {
      final d = (point - p).distance;
      if (d <= best) {
        best = d;
        hit = handle;
      }
    });
    if (hit != null) {
      _drag = _Drag.handle;
      _handle = hit!;
    } else if (rect.contains(p)) {
      _drag = _Drag.move;
    } else {
      _drag = _Drag.none;
    }
  }

  void _update(DragUpdateDetails details) {
    final display = widget.viewport.displaySize;
    final dx = details.delta.dx / display.width;
    final dy = details.delta.dy / display.height;
    switch (_drag) {
      case _Drag.move:
        widget.onChanged(widget.geometry.move(widget.crop, dx, dy));
      case _Drag.handle:
        widget.onChanged(
          widget.geometry.dragHandle(
            widget.crop,
            _handle,
            dx,
            dy,
            aspect: widget.aspect,
          ),
        );
      case _Drag.none:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final painter = CustomPaint(
      size: widget.viewport.viewSize,
      painter: _CropPainter(
        rect: _screenRect(widget.crop),
        bounds:
            Offset(widget.viewport.handleMargin, widget.viewport.handleMargin) &
            widget.viewport.displaySize,
        color: Colors.white,
        showHandles: widget.interactive,
      ),
    );
    if (!widget.interactive) return IgnorePointer(child: painter);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanStart: _start,
      onPanUpdate: _update,
      onPanEnd: (_) => _drag = _Drag.none,
      onPanCancel: () => _drag = _Drag.none,
      child: painter,
    );
  }
}

class _CropPainter extends CustomPainter {
  _CropPainter({
    required this.rect,
    required this.bounds,
    required this.color,
    required this.showHandles,
  });

  final Rect rect;
  final Rect bounds;
  final Color color;
  final bool showHandles;

  @override
  void paint(Canvas canvas, Size size) {
    // 프레임 밖은 어둡게.
    final dim = Paint()..color = Colors.black.withValues(alpha: 0.55);
    final outside = Path()
      ..addRect(bounds)
      ..addRect(rect)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(outside, dim);

    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawRect(rect, line);
    if (!showHandles) return;

    final grid = Paint()
      ..color = color.withValues(alpha: 0.4)
      ..strokeWidth = 0.5;
    for (var i = 1; i < 3; i++) {
      final x = rect.left + rect.width * i / 3;
      final y = rect.top + rect.height * i / 3;
      canvas.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), grid);
      canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), grid);
    }
    final handle = Paint()
      ..color = color
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.square;
    const len = 16.0;
    void corner(Offset o, double sx, double sy) {
      canvas.drawLine(o, o + Offset(sx * len, 0), handle);
      canvas.drawLine(o, o + Offset(0, sy * len), handle);
    }

    corner(rect.topLeft, 1, 1);
    corner(rect.topRight, -1, 1);
    corner(rect.bottomLeft, 1, -1);
    corner(rect.bottomRight, -1, -1);
  }

  @override
  bool shouldRepaint(_CropPainter old) =>
      old.rect != rect ||
      old.bounds != bounds ||
      old.showHandles != showHandles;
}
