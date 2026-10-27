// ignore_for_file: unused_field
import 'package:flutter/widgets.dart';

import 'toast_controller.dart';

/// [child] 위에 [controller.current]를 `toast.container`/`toast.message`로 겹쳐 그린다.
/// 앱이 백그라운드로 가면 `controller.screenVisible = false`로 알린다.
class ToastHost extends StatelessWidget {
  const ToastHost({super.key, required this.controller, required this.child});

  final ToastController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
