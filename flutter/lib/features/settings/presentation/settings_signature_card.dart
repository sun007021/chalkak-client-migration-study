import 'package:flutter/material.dart';

import '../../signature/presentation/signature_card_view_model.dart';

/// 설정 탭의 사인 카드(REQ-SET-004, TC-SET-003, 006). 제목 `Copy.signCardTitle`("사인 재설정").
/// testids: `settings.signature-card`(회원만), 상태별로 하나만 존재:
/// - `settings.signature-loading`: 보일 사인이 없고 조회 중일 때.
/// - `settings.signature-image`: [SignatureCardState.imageUrl]이 있을 때(썸네일 우선, 없으면 원본).
///   조회 중에도 이전 사인을 유지한다. 이미지 로드 실패는 플레이스홀더(`AppNetworkImage`).
/// - `settings.signature-error` + `settings.signature-retry-button`: [SignatureCardState.loadFailed]일 때
///   `Copy.signLoadError`와 "다시 불러오기"(누르면 `viewModel.load`).
/// `settings.signature-change-button`은 항상 있고 `Copy.signCardChange`("변경하기")이며 누르면 [onChange].
/// 조회 실패 토스트(`SignatureCardState.toast`)는 이 위젯이 아니라 화면이 보인다.
class SettingsSignatureCard extends StatelessWidget {
  const SettingsSignatureCard({
    super.key,
    required this.viewModel,
    required this.onChange,
  });

  final SignatureCardViewModel viewModel;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
