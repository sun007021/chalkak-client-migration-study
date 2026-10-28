import 'package:flutter/material.dart';

import '../test_id.dart';
import 'toast_controller.dart';
import 'toast_test_ids.dart';

/// [child] 위에 [controller.current]를 `toast.container`/`toast.message`로 겹쳐 그린다.
/// 앱이 백그라운드로 가면 `controller.screenVisible = false`로 알린다.
class ToastHost extends StatefulWidget {
  const ToastHost({super.key, required this.controller, required this.child});

  final ToastController controller;
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
              left: 24,
              right: 24,
              bottom: 0,
              child: SafeArea(
                minimum: const EdgeInsets.only(bottom: 96),
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

class _ToastBubble extends StatelessWidget {
  const _ToastBubble({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: TestId(
        ToastTestIds.container,
        child: Material(
          color: const Color(0xE6222222),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Semantics(
              liveRegion: true,
              child: TestId(
                ToastTestIds.message,
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
