import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../domain/ai_review_session.dart';
import '../domain/ai_review_state.dart';
import 'ai_review_host.dart';
import 'ai_review_test_ids.dart';

/// 홈 AI 피드백 카드(`HomeAiCardBuilder`가 그리는 위젯, REQ-AIR-052~053). 시트와 가시성 연동은
/// [AiReviewPill]과 같다.
///
/// - 카드 루트 `home.ai-card`. 상태별 내용: NONE `Copy.aiCardRequest` + `home.ai-request-button`
///   (시작 시트), PROCESSING·requesting `Copy.aiCardProcessing`(`home.ai-processing`), COMPLETED
///   `Copy.aiCardCompleted`(`home.ai-completed`) + "자세히 보기"(`home.ai-detail-button`, 결과 시트),
///   FAILED `Copy.aiCardFailed`(`home.ai-failed`) + `canRequestAgain`이고 오늘일 때만 "재요청"
///   (`home.ai-retry-button`, 시트 없이 바로 `POST`).
/// - 숨김(hidden)·확인중·다시 확인(recheck)은 카드를 그리지 않는다[추정: spec에 문구 없음].
/// - 오류·정지·404·네트워크 처리는 세션이 상세와 같은 규칙으로 한다.
class AiReviewHomeCard extends StatelessWidget {
  const AiReviewHomeCard({
    super.key,
    required this.session,
    this.visible = true,
  });

  final AiReviewSession session;
  final bool visible;

  @override
  Widget build(BuildContext context) {
    return AiReviewHost(
      session: session,
      visible: visible,
      builder: (context, state) {
        final content = _content(context, state.pill);
        if (content == null) return const SizedBox.shrink();
        return TestId(
          AiReviewTestIds.homeCard,
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: content,
            ),
          ),
        );
      },
    );
  }

  Widget? _content(BuildContext context, AiPill pill) {
    final style = Theme.of(context).textTheme.bodyMedium;
    switch (pill) {
      case AiPill.hidden || AiPill.checking || AiPill.recheck:
        return null;
      case AiPill.request:
        return TestId.button(
          AiReviewTestIds.homeRequestButton,
          child: InkWell(
            onTap: session.onPillPressed,
            child: Row(
              children: [
                Expanded(child: Text(Copy.aiCardRequest, style: style)),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
        );
      case AiPill.requesting || AiPill.processing:
        return TestId(
          AiReviewTestIds.homeProcessing,
          child: Text(Copy.aiCardProcessing, style: style),
        );
      case AiPill.view:
        return Row(
          children: [
            Expanded(
              child: TestId(
                AiReviewTestIds.homeCompleted,
                child: Text(Copy.aiCardCompleted, style: style),
              ),
            ),
            TestId.button(
              AiReviewTestIds.homeDetailButton,
              child: TextButton(
                onPressed: session.onPillPressed,
                child: const Text(Copy.aiCardDetail),
              ),
            ),
          ],
        );
      case AiPill.failed || AiPill.retry:
        return Row(
          children: [
            Expanded(
              child: TestId(
                AiReviewTestIds.homeFailed,
                child: Text(Copy.aiCardFailed, style: style),
              ),
            ),
            if (pill == AiPill.retry)
              TestId.button(
                AiReviewTestIds.homeRetryButton,
                child: TextButton(
                  onPressed: session.onPillPressed,
                  child: const Text(Copy.aiCardRetry),
                ),
              ),
          ],
        );
    }
  }
}
