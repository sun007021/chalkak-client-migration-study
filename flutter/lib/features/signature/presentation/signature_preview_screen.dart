import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../domain/signature_mode.dart';
import 'signature_preview_view_model.dart';
import 'signature_test_ids.dart';

/// 사인 미리보기 화면. testids: `signature-preview.root`, `.title`("이렇게 보여요"),
/// `.image`(PNG를 어두운 배경 위에, 흰 획이 보이게), `.redraw-button`,
/// `.confirm-button`(가입 "시작하기", 변경 "사인 변경하기", 진행 중 enabled=false),
/// `.change-notice`(변경 모드에서만 존재), `.loading`(진행 중에만 존재),
/// `.error-message`(오류가 있을 때만 존재), `.error-dialog`·`.error-dialog-confirm-button`
/// (가입 모드의 오류에서만 존재, 확인을 누르면 오류가 사라진다).
/// 시작 시 [SignaturePreviewViewModel.onShown]을 부르고 이벤트는 [onEvent]로 넘긴다.
class SignaturePreviewScreen extends StatefulWidget {
  const SignaturePreviewScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final SignaturePreviewViewModel viewModel;
  final void Function(SignaturePreviewEvent event) onEvent;

  @override
  State<SignaturePreviewScreen> createState() => _SignaturePreviewScreenState();
}

class _SignaturePreviewScreenState extends State<SignaturePreviewScreen> {
  StreamSubscription<SignaturePreviewEvent>? _events;
  int? _shownErrorId;
  bool _dialogOpen = false;

  SignaturePreviewViewModel get _vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void didUpdateWidget(SignaturePreviewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewModel != widget.viewModel) {
      _detach(oldWidget.viewModel);
      _attach();
    }
  }

  @override
  void dispose() {
    _detach(_vm);
    super.dispose();
  }

  void _attach() {
    _events = _vm.events.listen(_onEvent);
    _vm.addListener(_showErrorDialogIfNeeded);
    _vm.onShown();
  }

  void _detach(SignaturePreviewViewModel viewModel) {
    viewModel.removeListener(_showErrorDialogIfNeeded);
    _events?.cancel();
  }

  void _onEvent(SignaturePreviewEvent event) {
    if (!mounted) return;
    // 다른 화면으로 떠나면서 열려 있는 오류 알림이 남지 않게 먼저 닫는다.
    if (_dialogOpen) Navigator.of(context).pop();
    widget.onEvent(event);
  }

  /// 가입 모드의 오류는 알림 대화상자로 보여 준다(변경 모드는 화면 안 문구).
  void _showErrorDialogIfNeeded() {
    final state = _vm.state;
    final error = state.error;
    if (!mounted ||
        error == null ||
        state.mode != SignatureMode.onboarding ||
        error.id == _shownErrorId) {
      return;
    }
    _shownErrorId = error.id;
    _dialogOpen = true;
    unawaited(
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _ErrorDialog(message: error.text),
      ).then((_) {
        _dialogOpen = false;
        if (_vm.state.error?.id == error.id) _vm.dismissError();
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _vm,
      builder: (context, _) {
        final state = _vm.state;
        final change = state.mode == SignatureMode.change;
        final inlineError = change ? state.error : null;
        return PopScope(
          // 제출하는 동안은 뒤로 가기로 빠져나가지 않는다.
          canPop: !state.isSubmitting,
          child: TestId(
            SignatureTestIds.previewRoot,
            child: Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 24),
                      TestId(
                        SignatureTestIds.previewTitle,
                        child: Text(
                          Copy.onbSignPreviewTitle,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: Center(
                          child: AspectRatio(
                            aspectRatio: 2,
                            child: TestId(
                              SignatureTestIds.previewImage,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                // 사인은 투명 배경에 흰 획이라 어두운 바탕이 있어야 보인다.
                                child: ColoredBox(
                                  color: const Color(0xFF2B2B30),
                                  child: Image.memory(
                                    state.png,
                                    fit: BoxFit.contain,
                                    gaplessPlayback: true,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (change) ...[
                        const SizedBox(height: 12),
                        const TestId(
                          SignatureTestIds.previewChangeNotice,
                          child: Text(
                            Copy.signChangeNotice,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                      SizedBox(
                        height: 48,
                        child: Center(
                          child: state.isSubmitting
                              ? const TestId(
                                  SignatureTestIds.previewLoading,
                                  child: SizedBox.square(
                                    dimension: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                    ),
                                  ),
                                )
                              : inlineError == null
                              ? null
                              : TestId(
                                  SignatureTestIds.previewErrorMessage,
                                  child: Text(
                                    inlineError.text,
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .error,
                                    ),
                                  ),
                                ),
                        ),
                      ),
                      TestId.button(
                        SignatureTestIds.previewRedrawButton,
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                          ),
                          onPressed: state.isSubmitting
                              ? null
                              : _vm.onRedrawPressed,
                          child: const Text(Copy.onbSignPreviewRedraw),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TestId.button(
                        SignatureTestIds.previewConfirmButton,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                          ),
                          onPressed: state.isSubmitting
                              ? null
                              : _vm.onConfirmPressed,
                          child: Text(
                            change
                                ? Copy.signChangeConfirm
                                : Copy.onbSignPreviewStart,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ErrorDialog extends StatelessWidget {
  const _ErrorDialog({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return TestId(
      SignatureTestIds.previewErrorDialog,
      child: AlertDialog(
        content: TestId(
          SignatureTestIds.previewErrorMessage,
          child: Text(message),
        ),
        actions: [
          TestId.button(
            SignatureTestIds.previewErrorDialogConfirmButton,
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(Copy.commonConfirm),
            ),
          ),
        ],
      ),
    );
  }
}
