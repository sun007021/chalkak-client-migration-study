import 'package:flutter/material.dart';

import '../../design/chalkak_tokens.dart';
import '../test_id.dart';
import 'toast_controller.dart';
import 'toast_test_ids.dart';

/// [child] 위에 [controller.current]를 `toast.container`/`toast.message`로 겹쳐 그린다.
/// 앱이 백그라운드로 가면 `controller.screenVisible = false`로 알린다.
class ToastHost extends StatefulWidget {
  const ToastHost({
    super.key,
    required this.controller,
    required this.child,
    this.bottomOffset = 32,
  });

  final ToastController controller;

  /// 화면 아래(안전 영역 포함)에서 띄우는 거리. 원본은 32이고, 하단 바가 있는 화면은 바 위로 올린다.
  final double bottomOffset;
  final Widget child;

  @override
  State<ToastHost> createState() => _ToastHostState();
}

class _ToastHostState extends State<ToastHost> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.controller
      ..cancelPending()
      ..screenVisible = true;
    super.dispose();
  }

  /// `inactive`(권한 창, 앱 전환 중)에서는 화면이 아직 보이므로 숨기지 않는다.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    widget.controller.screenVisible = switch (state) {
      AppLifecycleState.resumed || AppLifecycleState.inactive => true,
      AppLifecycleState.hidden ||
      AppLifecycleState.paused ||
      AppLifecycleState.detached => false,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.passthrough,
      children: [
        widget.child,
        ListenableBuilder(
          listenable: widget.controller,
          builder: (context, _) {
            final toast = widget.controller.current;
            if (toast == null) return const SizedBox.shrink();
            return Positioned(
              left: context.tokens.spacing.screenHorizontal,
              right: context.tokens.spacing.screenHorizontal,
              bottom: 0,
              child: SafeArea(
                minimum: EdgeInsets.only(bottom: widget.bottomOffset),
                child: IgnorePointer(
                  child: _ToastBubble(
                    key: ValueKey(toast.id),
                    text: toast.text,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

/// 캡슐 토스트(screens-c §1.1, ChalkakToast.swift): actionPrimary 캡슐, subheadline onActionPrimary 가운데 정렬,
/// 안쪽 좌우 16 / 위아래 12. 아래에서 올라오며 나타난다(snappy ~0.25s). 터치를 막지 않는다.
class _ToastBubble extends StatelessWidget {
  const _ToastBubble({super.key, required this.text});

  final String text;

  /// iOS `.move(edge: .bottom) + .opacity`, `.snappy`에 가까운 값.
  static const _enter = Duration(milliseconds: 250);

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Center(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: _enter,
        curve: Curves.easeOutCubic,
        builder: (context, t, child) => Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, 24 * (1 - t)),
            child: child,
          ),
        ),
        child: TestId(
          ToastTestIds.container,
          child: DecoratedBox(
            decoration: ShapeDecoration(
              color: tokens.colors.actionPrimary,
              shape: const StadiumBorder(),
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: tokens.spacing.lg,
                vertical: tokens.spacing.md,
              ),
              child: Semantics(
                liveRegion: true,
                child: TestId(
                  ToastTestIds.message,
                  child: Text(
                    text,
                    textAlign: TextAlign.center,
                    style: tokens.text.subheadline.copyWith(
                      color: tokens.colors.onActionPrimary,
                      decoration: TextDecoration.none,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
