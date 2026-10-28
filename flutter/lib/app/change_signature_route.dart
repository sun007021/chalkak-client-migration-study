import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/constants/app_constants.dart';
import '../features/signature/domain/signature_mode.dart';
import '../features/signature/presentation/signature_draw_screen.dart';
import '../features/signature/presentation/signature_draw_view_model.dart';
import '../features/signature/presentation/signature_preview_screen.dart';
import '../features/signature/presentation/signature_preview_view_model.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';
import 'view_model_host.dart';

/// 설정의 사인 변경 흐름: 그리기 -> 미리보기. 같은 화면을 가입과 함께 쓰되 [SignatureMode.change]다.
/// 변경에 성공해 설정으로 돌아오면 true, 뒤로 가기 등으로 끝나면 false를 돌려준다.
/// 만료(expired)면 로그인으로 `go`하며 안내 문구를 extra로 넘긴다(스택 교체).
Future<bool> openChangeSignature(
  BuildContext context,
  AppDependencies dependencies,
) async {
  final result = await Navigator.of(context).push<bool>(
    MaterialPageRoute<bool>(
      builder: (_) => _ChangeSignatureDraw(dependencies: dependencies),
    ),
  );
  return result ?? false;
}

/// 미리보기가 그리기 화면에 돌려주는 결과.
sealed class _PreviewResult {
  const _PreviewResult();
}

/// 사인 변경이 끝났다. 그리기 화면도 닫고 설정으로 돌아간다.
final class _PreviewDone extends _PreviewResult {
  const _PreviewDone();
}

/// 서버가 사인을 거절했다. 그리기 화면에 [message]를 보인다.
final class _PreviewRejected extends _PreviewResult {
  const _PreviewRejected(this.message);

  final String message;
}

class _ChangeSignatureDraw extends StatelessWidget {
  const _ChangeSignatureDraw({required this.dependencies});

  final AppDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return ViewModelHost<SignatureDrawViewModel>(
      create: () => SignatureDrawViewModel(
        mode: SignatureMode.change,
        renderer: dependencies.signatureRenderer,
        analytics: dependencies.analytics,
        // 실제 크기는 화면이 레이아웃 뒤에 알려 준다.
        canvasWidth: AppConstants.signaturePngWidth.toDouble(),
        canvasHeight: AppConstants.signaturePngHeight.toDouble(),
      ),
      builder: (context, viewModel) => SignatureDrawScreen(
        viewModel: viewModel,
        onEvent: (event) => switch (event) {
          NavigateToPreview(:final png) => unawaited(
            _openPreview(context, viewModel, png),
          ),
          NavigateBackFromDrawing() => Navigator.of(context).pop(false),
        },
      ),
    );
  }

  Future<void> _openPreview(
    BuildContext context,
    SignatureDrawViewModel viewModel,
    Uint8List png,
  ) async {
    final result = await Navigator.of(context).push<_PreviewResult>(
      MaterialPageRoute<_PreviewResult>(
        builder: (_) =>
            _ChangeSignaturePreview(dependencies: dependencies, png: png),
      ),
    );
    // 로그인으로 가며 스택이 교체됐거나 화면이 사라졌다.
    if (!context.mounted) return;
    switch (result) {
      case _PreviewDone():
        Navigator.of(context).pop(true);
      case _PreviewRejected(:final message):
        viewModel
          ..clear()
          ..reset()
          ..showError(message);
      case null:
        // "다시 그리기"·뒤로 가기: 그림을 지운 채 다시 그린다.
        viewModel
          ..clear()
          ..reset();
    }
  }
}

class _ChangeSignaturePreview extends StatelessWidget {
  const _ChangeSignaturePreview({
    required this.dependencies,
    required this.png,
  });

  final AppDependencies dependencies;
  final Uint8List png;

  @override
  Widget build(BuildContext context) {
    return ViewModelHost<SignaturePreviewViewModel>(
      create: () => SignaturePreviewViewModel(
        mode: SignatureMode.change,
        png: png,
        submitter: dependencies.changeSignatureUseCase,
        analytics: dependencies.analytics,
      ),
      builder: (context, viewModel) => SignaturePreviewScreen(
        viewModel: viewModel,
        onEvent: (event) => _onEvent(context, event),
      ),
    );
  }

  void _onEvent(BuildContext context, SignaturePreviewEvent event) {
    switch (event) {
      case PreviewRedraw():
        Navigator.of(context).pop();
      case PreviewReturnToDrawing(:final message):
        Navigator.of(context).pop(_PreviewRejected(message));
      case PreviewChangeCompleted(:final toastMessage):
        dependencies.main.toast.show(toastMessage);
        Navigator.of(context).pop(const _PreviewDone());
      case PreviewReturnToLogin(:final message):
        context.go(AppRoutes.login, extra: message);
      case PreviewSignUpCompleted():
        // 가입 모드에서만 나온다.
        break;
    }
  }
}
