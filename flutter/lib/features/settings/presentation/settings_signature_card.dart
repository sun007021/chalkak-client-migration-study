import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../../signature/presentation/signature_card_view_model.dart';
import 'settings_test_ids.dart';

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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TestId(
      SettingsTestIds.signatureCard,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(Copy.signCardTitle, style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
                _content(context, viewModel.state),
                const SizedBox(height: 12),
                TestId.button(
                  SettingsTestIds.signatureChangeButton,
                  child: OutlinedButton(
                    onPressed: onChange,
                    child: const Text(Copy.signCardChange),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 상태마다 하나만 그린다. 보일 사인이 있으면 조회 중에도 그 사인을 유지한다.
  Widget _content(BuildContext context, SignatureCardState state) {
    final imageUrl = state.imageUrl;
    if (imageUrl != null) {
      return TestId(
        SettingsTestIds.signatureImage,
        child: SizedBox(
          height: 120,
          child: AppNetworkImage(url: imageUrl, fit: BoxFit.contain),
        ),
      );
    }
    if (state.loadFailed) {
      final theme = Theme.of(context);
      return Row(
        children: [
          Expanded(
            child: TestId(
              SettingsTestIds.signatureError,
              child: Text(
                Copy.signLoadError,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ),
          ),
          TestId.button(
            SettingsTestIds.signatureRetryButton,
            child: TextButton(
              onPressed: () => unawaited(viewModel.load()),
              child: const Text(Copy.commonRetry),
            ),
          ),
        ],
      );
    }
    if (state.status == SignatureCardStatus.loading ||
        state.status == SignatureCardStatus.idle) {
      return const TestId(
        SettingsTestIds.signatureLoading,
        child: SizedBox(
          height: 120,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    // 재등록이 필요한 계정: 이미지 없이 "변경하기"만 보인다.
    return const SizedBox.shrink();
  }
}
