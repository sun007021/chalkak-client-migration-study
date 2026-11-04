import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_dialog.dart';
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
    required this.onCancelPressed,
    required this.showCancel,
  });

  final BootViewModel viewModel;
  final void Function(BootReady ready) onReady;
  final VoidCallback onUpdatePressed;
  final VoidCallback onCancelPressed;

  /// "취소" 버튼 노출 정책(Android true, iOS false). 주입한 값으로만 정한다.
  final bool showCancel;

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
            // 런치 화면과 이어지도록 같은 바탕색·로고(Info.plist ChalkakLogoBackground, 220x220).
            backgroundColor: context.tokens.colors.logoBackground,
            body: Stack(
              children: [
                Center(
                  child: TestId(
                    TestIds.splashLogo,
                    child: Image.asset(
                      'assets/images/ChalkakLaunchLogo.png',
                      width: 220,
                      height: 220,
                      semanticLabel: Copy.appName,
                    ),
                  ),
                ),
                if (forced) ...[
                  ModalBarrier(
                    dismissible: false,
                    color: context.tokens.colors.scrim,
                  ),
                  _UpdateDialog(
                    onUpdate: widget.onUpdatePressed,
                    onCancel: widget.showCancel ? widget.onCancelPressed : null,
                  ),
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
  const _UpdateDialog({required this.onUpdate, required this.onCancel});

  final VoidCallback onUpdate;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: TestId(
        TestIds.updateGateDialog,
        child: ChalkakDialog(
          title: Copy.bootUpdateTitle,
          titleId: TestIds.updateGateTitle,
          message: Copy.bootUpdateBody,
          messageId: TestIds.updateGateMessage,
          actions: [
            if (onCancel != null)
              TestId.button(
                TestIds.updateGateCancelButton,
                child: ChalkakDialogButton(
                  kind: ChalkakDialogButtonKind.cancel,
                  label: Copy.bootUpdateCancel,
                  onPressed: onCancel,
                ),
              ),
            TestId.button(
              TestIds.updateGateUpdateButton,
              child: ChalkakDialogButton(
                label: Copy.bootUpdateButton,
                onPressed: onUpdate,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
