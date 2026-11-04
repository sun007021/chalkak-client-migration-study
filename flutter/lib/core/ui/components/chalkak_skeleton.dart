import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';

/// 로딩 스켈레톤(screens-a §1.8). 바탕 skeletonBase 위로 skeletonHighlight 띠(너비의 0.6배)가
/// 왼쪽에서 오른쪽으로 1.2초 linear 무한 반복으로 지나간다. 모서리는 쓰는 쪽이 [borderRadius]로 자른다.
class ChalkakSkeleton extends StatefulWidget {
  const ChalkakSkeleton({
    super.key,
    this.borderRadius,
    this.width,
    this.height,
  });

  final BorderRadiusGeometry? borderRadius;
  final double? width;
  final double? height;

  /// 원본 shimmer 한 바퀴 시간(ChalkakSkeleton.swift: linear 1.2s).
  static const shimmerPeriod = Duration(milliseconds: 1200);

  @override
  State<ChalkakSkeleton> createState() => _ChalkakSkeletonState();
}

class _ChalkakSkeletonState extends State<ChalkakSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: ChalkakSkeleton.shimmerPeriod,
  );

  @override
  void initState() {
    super.initState();
    _controller.repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    // 모션 줄이기: 띠를 멈추고 바탕만 보인다.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
    final painter = RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => CustomPaint(
          painter: _ShimmerPainter(
            progress: _controller.value,
            base: colors.skeletonBase,
            highlight: colors.skeletonHighlight,
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: ClipRRect(
        borderRadius: widget.borderRadius ?? BorderRadius.zero,
        child: ExcludeSemantics(child: painter),
      ),
    );
  }
}

class _ShimmerPainter extends CustomPainter {
  _ShimmerPainter({
    required this.progress,
    required this.base,
    required this.highlight,
  });

  final double progress;
  final Color base;
  final Color highlight;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = base);
    final band = size.width * 0.6;
    // offset: -band -> width
    final left = -band + (size.width + band) * progress;
    final rect = Rect.fromLTWH(left, 0, band, size.height);
    final clear = highlight.withValues(alpha: 0);
    final shader = LinearGradient(colors: [clear, highlight, clear])
        .createShader(rect);
    canvas.drawRect(rect, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_ShimmerPainter old) =>
      old.progress != progress ||
      old.base != base ||
      old.highlight != highlight;
}

/// 로딩이 [showDelay]보다 짧게 끝나면 스켈레톤을 띄우지 않고, 한 번 뜨면 [minVisible] 동안 유지한 뒤
/// opacity로 사라진다(screens-a §1.8 `loadingSkeleton`: 0.5s / 0.25s / easeOut 0.2s).
/// [child] 위에 [skeleton]을 덮는 방식이라 [child]의 상태를 잃지 않는다.
class LoadingSkeleton extends StatefulWidget {
  const LoadingSkeleton({
    super.key,
    required this.isLoading,
    required this.skeleton,
    required this.child,
    this.showDelay = const Duration(milliseconds: 500),
    this.minVisible = const Duration(milliseconds: 250),
  });

  final bool isLoading;
  final Widget skeleton;
  final Widget child;
  final Duration showDelay;
  final Duration minVisible;

  @override
  State<LoadingSkeleton> createState() => _LoadingSkeletonState();
}

class _LoadingSkeletonState extends State<LoadingSkeleton> {
  Timer? _timer;
  bool _showing = false;
  DateTime? _shownAt;

  @override
  void initState() {
    super.initState();
    if (widget.isLoading) _scheduleShow();
  }

  @override
  void didUpdateWidget(LoadingSkeleton old) {
    super.didUpdateWidget(old);
    if (widget.isLoading == old.isLoading) return;
    if (widget.isLoading) {
      _scheduleShow();
    } else {
      _scheduleHide();
    }
  }

  void _scheduleShow() {
    _timer?.cancel();
    if (_showing) return;
    _timer = Timer(widget.showDelay, () {
      if (!mounted) return;
      setState(() {
        _showing = true;
        _shownAt = clock.now();
      });
    });
  }

  void _scheduleHide() {
    _timer?.cancel();
    if (!_showing) return;
    final shownAt = _shownAt ?? clock.now();
    final remain = widget.minVisible - clock.now().difference(shownAt);
    if (remain <= Duration.zero) {
      setState(() => _showing = false);
      return;
    }
    _timer = Timer(remain, () {
      if (mounted) setState(() => _showing = false);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.passthrough,
      children: [
        widget.child,
        Positioned.fill(
          child: IgnorePointer(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              switchInCurve: Curves.easeOut,
              switchOutCurve: Curves.easeOut,
              child: _showing
                  ? KeyedSubtree(
                      key: const ValueKey('skeleton'),
                      child: widget.skeleton,
                    )
                  : const SizedBox.shrink(key: ValueKey('none')),
            ),
          ),
        ),
      ],
    );
  }
}
