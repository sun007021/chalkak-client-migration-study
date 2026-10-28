import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/ui/test_id.dart';
import '../domain/photo_edit_constants.dart';
import '../domain/ruler_scale.dart';

/// 조정 눈금자(TC-EDIT-038): 값 -1~1을 단위당 [PhotoEditConstants.rulerDpPerUnit]dp 눈금으로 그리고
/// 가운데 표시선에 걸린 값을 정수 -100~100으로 보여 준다. 손가락을 오른쪽으로 끌면 값이 줄고
/// 0과 [detents] 근처에서는 그 값으로 붙는다.
class RulerSlider extends StatefulWidget {
  const RulerSlider({
    super.key,
    required this.id,
    required this.value,
    required this.onChanged,
    this.detents = const [0],
  });

  /// testID(`photo-edit.adjust-*-slider`).
  final String id;
  final double value;
  final ValueChanged<double> onChanged;
  final List<double> detents;

  @override
  State<RulerSlider> createState() => _RulerSliderState();
}

class _RulerSliderState extends State<RulerSlider> {
  static const _scale = RulerScale();

  /// 끄는 동안 디텐트를 적용하기 전의 값.
  double? _raw;

  void _onDrag(DragUpdateDetails details) {
    final start = _raw ?? widget.value;
    final next = (start - _scale.offsetToValue(details.delta.dx)).clamp(
      -1.0,
      1.0,
    );
    _raw = next;
    widget.onChanged(_scale.snap(next, widget.detents));
  }

  @override
  Widget build(BuildContext context) {
    final label = (widget.value * 100).round();
    final scheme = Theme.of(context).colorScheme;
    return TestId(
      widget.id,
      child: Semantics(
        slider: true,
        value: '$label',
        increasedValue: '${math.min(100, label + 1)}',
        decreasedValue: '${math.max(-100, label - 1)}',
        onIncrease: () =>
            widget.onChanged((widget.value + 0.01).clamp(-1.0, 1.0)),
        onDecrease: () =>
            widget.onChanged((widget.value - 0.01).clamp(-1.0, 1.0)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: Text(
                '$label',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onHorizontalDragStart: (_) => _raw = widget.value,
              onHorizontalDragUpdate: _onDrag,
              onHorizontalDragEnd: (_) => _raw = null,
              onHorizontalDragCancel: () => _raw = null,
              child: SizedBox(
                height: 44,
                width: double.infinity,
                child: CustomPaint(
                  painter: _RulerPainter(
                    value: widget.value,
                    tickColor: scheme.onSurface.withValues(alpha: 0.5),
                    markColor: scheme.primary,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RulerPainter extends CustomPainter {
  _RulerPainter({
    required this.value,
    required this.tickColor,
    required this.markColor,
  });

  final double value;
  final Color tickColor;
  final Color markColor;

  static const _scale = RulerScale();

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.width / 2;
    final tick = Paint()
      ..color = tickColor
      ..strokeWidth = 1;
    final strong = Paint()
      ..color = tickColor
      ..strokeWidth = 2;
    // 눈금 간격: 단위를 rulerTicks 칸으로 나눈다(= 8dp).
    final step = 1 / PhotoEditConstants.rulerTicks;
    final shift = _scale.valueToOffset(value);
    for (
      var i = -PhotoEditConstants.rulerTicks;
      i <= PhotoEditConstants.rulerTicks;
      i++
    ) {
      final x = center + _scale.valueToOffset(i * step) - shift;
      if (x < 0 || x > size.width) continue;
      final major = i % 5 == 0;
      final h = major ? size.height * 0.55 : size.height * 0.3;
      canvas.drawLine(
        Offset(x, (size.height - h) / 2),
        Offset(x, (size.height + h) / 2),
        major ? strong : tick,
      );
    }
    canvas.drawLine(
      Offset(center, 0),
      Offset(center, size.height),
      Paint()
        ..color = markColor
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_RulerPainter old) =>
      old.value != value ||
      old.tickColor != tickColor ||
      old.markColor != markColor;
}
