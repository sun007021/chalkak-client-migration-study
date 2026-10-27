import 'package:flutter/material.dart';

import 'signature_preview_view_model.dart';

/// 사인 미리보기 화면. testids: `signature-preview.root`, `.title`("이렇게 보여요"),
/// `.image`(PNG를 어두운 배경 위에, 흰 획이 보이게), `.redraw-button`,
/// `.confirm-button`(가입 "시작하기", 변경 "사인 변경하기", 진행 중 enabled=false),
/// `.change-notice`(변경 모드에서만 존재), `.loading`(진행 중에만 존재),
/// `.error-message`(오류가 있을 때만 존재), `.error-dialog`·`.error-dialog-confirm-button`
/// (가입 모드의 오류에서만 존재, 확인을 누르면 오류가 사라진다).
/// 시작 시 [SignaturePreviewViewModel.onShown]을 부르고 이벤트는 [onEvent]로 넘긴다.
class SignaturePreviewScreen extends StatelessWidget {
  const SignaturePreviewScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final SignaturePreviewViewModel viewModel;
  final void Function(SignaturePreviewEvent event) onEvent;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
