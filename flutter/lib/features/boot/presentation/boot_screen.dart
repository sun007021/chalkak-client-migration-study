import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../../../core/ui/test_ids.dart';
import '../domain/boot_view_model.dart';

/// 스플래시. 로고(`splash.logo`)를 그리고, [BootForceUpdate]면 닫을 수 없는 업데이트
/// 다이얼로그(`update-gate.*`)를 겹친다(뒤로가기·바깥 탭 무효). [BootReady]가 되면
/// [onReady]를 한 번 부른다(라우터가 login/home으로 이동). 문구는 Copy.bootUpdate*.
class BootScreen extends StatefulWidget {
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
  State<BootScreen> createState() => _BootScreenState();
}

class _BootScreenState extends State<BootScreen> {
  bool _notified = false;

  @override
  void initState() {
    super.initState();
    widget.viewModel.addListener(_notifyIfReady);
    WidgetsBinding.instance.addPostFrameCallback((_) => _notifyIfReady());
  }

  @override
  void dispose() {
    widget.viewModel.removeListener(_notifyIfReady);
    super.dispose();
  }

  void _notifyIfReady() {
    final state = widget.viewModel.state;
    if (_notified || !mounted || state is! BootReady) return;
    _notified = true;
    // 화면 전환은 빌드가 아닌 프레임 사이에 한다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onReady(state);
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (context, _) {
        final forced = widget.viewModel.state is BootForceUpdate;
        return PopScope(
          canPop: !forced,
          child: Scaffold(
            body: Stack(
              children: [
                Center(
                  child: TestId(
                    TestIds.splashLogo,
                    child: Text(
                      Copy.appName,
                      style: Theme.of(context).textTheme.displayMedium,
                    ),
                  ),
                ),
                if (forced) ...[
                  const ModalBarrier(dismissible: false, color: Colors.black54),
                  _UpdateDialog(onPressed: widget.onUpdatePressed),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _UpdateDialog extends StatelessWidget {
  const _UpdateDialog({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: TestId(
        TestIds.updateGateDialog,
        child: AlertDialog(
          title: const TestId(
            TestIds.updateGateTitle,
            child: Text(Copy.bootUpdateTitle),
          ),
          content: const TestId(
            TestIds.updateGateMessage,
            child: Text(Copy.bootUpdateBody),
          ),
          actions: [
            TestId.button(
              TestIds.updateGateUpdateButton,
              child: FilledButton(
                onPressed: onPressed,
                child: const Text(Copy.bootUpdateButton),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
