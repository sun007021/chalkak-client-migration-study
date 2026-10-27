import 'package:flutter/material.dart';

import '../domain/boot_view_model.dart';

/// 스플래시. 로고(`splash.logo`)를 그리고, [BootForceUpdate]면 닫을 수 없는 업데이트
/// 다이얼로그(`update-gate.*`)를 겹친다(뒤로가기·바깥 탭 무효). [BootReady]가 되면
/// [onReady]를 한 번 부른다(라우터가 login/home으로 이동). 문구는 Copy.bootUpdate*.
class BootScreen extends StatelessWidget {
  const BootScreen({
    super.key,
    required this.viewModel,
    required this.onReady,
    required this.onUpdatePressed,
  });

  final BootViewModel viewModel;
  final void Function(BootReady ready) onReady;
  final VoidCallback onUpdatePressed;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
