import 'package:flutter/material.dart';

import 'signature_draw_view_model.dart';

/// 사인 그리기 화면. testids: `signature.root`(mode를 Semantics value로 노출: `onboarding`/`change`),
/// `signature.title`, `signature.guide-text`, `signature.canvas`(드래그 = 획),
/// `signature.canvas-hint`(획이 없을 때만 존재), `signature.undo-button`·`signature.clear-button`·
/// `signature.submit-button`(획이 없으면 enabled=false), `signature.back-button`,
/// `signature.error-message`(오류가 있을 때만 존재).
/// 문구는 `onb.sign.*`. 캔버스에는 흰 획이 보이는 어두운 배경을 쓴다.
/// 시작 시 [SignatureDrawViewModel.onShown]을 부르고, 이벤트는 [onEvent]로 넘긴다.
class SignatureDrawScreen extends StatelessWidget {
  const SignatureDrawScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final SignatureDrawViewModel viewModel;
  final void Function(SignatureDrawEvent event) onEvent;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
