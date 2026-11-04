import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_card.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
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
    final tokens = context.tokens;
    return TestId(
      SettingsTestIds.signatureCard,
      child: ChalkakCard(
        child: ListenableBuilder(
          listenable: viewModel,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 헤더 행(screens-c §4.2): 사인 재설정 + 변경하기(밑줄), 좌우 20, 위 18.
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        Copy.signCardTitle,
                        style: tokens.text.callout.copyWith(
                          color: tokens.colors.textPrimary,
                        ),
                      ),
                    ),
                    TestId.button(
                      SettingsTestIds.signatureChangeButton,
                      child: Semantics(
                        button: true,
                        label: Copy.signCardChange,
                        excludeSemantics: true,
                        onTap: onChange,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: onChange,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 44),
                            child: Center(
                              child: Text(
                                Copy.signCardChange,
                                style: tokens.text.callout.copyWith(
                                  color: tokens.colors.textSecondary,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(20, tokens.spacing.lg, 20, 20),
                child: _canvas(context, viewModel.state),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 사인 캔버스: 높이 112, actionPrimary 바탕, 라운드 button(12), 점선 1(textOnImage 28%).
  Widget _canvas(BuildContext context, SignatureCardState state) {
    final tokens = context.tokens;
    final imageUrl = state.imageUrl;
    final Widget child;
    if (imageUrl != null) {
      child = TestId(
        SettingsTestIds.signatureImage,
        child: SizedBox(
          width: 120,
          height: 48,
          child: AppNetworkImage(url: imageUrl, fit: BoxFit.contain),
        ),
      );
    } else if (state.loadFailed) {
      child = Row(
        children: [
          Expanded(
            child: TestId(
              SettingsTestIds.signatureError,
              child: Text(
                Copy.signLoadError,
                style: tokens.text.footnote.copyWith(
                  color: tokens.colors.onActionPrimary,
                ),
              ),
            ),
          ),
          TestId.button(
            SettingsTestIds.signatureRetryButton,
            child: TextButton(
              style: TextButton.styleFrom(
                foregroundColor: tokens.colors.onActionPrimary,
              ),
              onPressed: () => unawaited(viewModel.load()),
              child: const Text(Copy.commonRetry),
            ),
          ),
        ],
      );
    } else if (state.status == SignatureCardStatus.loading ||
        state.status == SignatureCardStatus.idle) {
      child = const TestId(
        SettingsTestIds.signatureLoading,
        child: SizedBox(width: 120, height: 48, child: ChalkakSkeleton()),
      );
    } else {
      // 재등록이 필요한 계정: 빈 캔버스.
      child = const SizedBox.shrink();
    }
    return CustomPaint(
      foregroundPainter: _DashedBorderPainter(
        color: tokens.colors.textOnImage.withValues(alpha: 0.28),
        radius: tokens.radius.button,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tokens.colors.actionPrimary,
          borderRadius: BorderRadius.circular(tokens.radius.button),
        ),
        child: SizedBox(
          height: 112,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(child: child),
          ),
        ),
      ),
    );
  }
}

/// 점선 테두리: 두께 1, dash [4, 3] (SettingsComponents.swift:331-339).
class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          (Offset.zero & size).deflate(0.5),
          Radius.circular(radius),
        ),
      );
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + 4), paint);
        distance += 7;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.radius != radius;
}
