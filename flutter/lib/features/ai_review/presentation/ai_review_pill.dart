import 'package:flutter/material.dart';

import '../../../core/ui/test_id.dart';
import '../domain/ai_review_session.dart';
import '../domain/ai_review_state.dart';
import 'ai_review_host.dart';
import 'ai_review_test_ids.dart';

/// 상세 화면(`FeedScreen.aiSlot`)의 AI 피드백 알약과 시트 표시.
///
/// - [AiReviewSession.state.pill]에 따라 알약을 그린다(문구 `AiPill.label`, 비활성은 누를 수 없음,
///   hidden이면 아무것도 그리지 않는다). testids.md 상세 AI 절의 식별자를 단다
///   (checking `feed.ai-checking`, request `feed.ai-request-button`, requesting `feed.ai-requesting`,
///   processing `feed.ai-processing`, view `feed.ai-result-button`, retry `feed.ai-retry-button`,
///   failed `feed.ai-failed-button`, recheck `feed.ai-recheck-button`). 비활성 알약은 버튼 시맨틱스의
///   enabled=false를 노출한다.
/// - `state.notice`가 있으면 알약 아래에 `feed.ai-message`로 그린다.
/// - `state.sheet`가 생기면 하단 시트로 연다. 시작 시트(`ai-start-sheet.*`: 제목 `Copy.aiStartTitle`/
///   `aiStartTitleRetry`, 안내 세 줄, "분석 시작하기" -> [AiReviewSession.onStartConfirmed], 닫기),
///   결과 시트(`ai-result-sheet.*`: 종합 점수와 접근성 라벨, 기준 목록 `criteria-item-{key}`, 배지,
///   요약, 좋았던 점·아쉬운 점·다음엔 이렇게 순서, 기준 안내 버튼과 다이얼로그, 닫기), 실패 시트
///   (`ai-failed-sheet.*`: 제목, 이유 문구, "확인" 하나). 시트가 닫히면
///   [AiReviewSession.onSheetDismissed]를 부른다. 시작 시트에는 동의 체크 UI가 없다(REQ-AIR/AIREVIEW-006).
/// - 위젯이 붙으면 [AiReviewSession.onShown], 사라지면 [AiReviewSession.onHidden]을 부르고
///   [visible]이 false가 되거나 앱이 백그라운드로 가면 [AiReviewSession.onHidden], 다시 보이면
///   [AiReviewSession.onShown]을 부른다.
/// - 사용자에게 보이는 모든 문구는 "AI 피드백"으로 통일한다("AI 리뷰"는 서버 message에서만).
class AiReviewPill extends StatelessWidget {
  const AiReviewPill({super.key, required this.session, this.visible = true});

  final AiReviewSession session;
  final bool visible;

  @override
  Widget build(BuildContext context) {
    return AiReviewHost(
      session: session,
      visible: visible,
      builder: (context, state) {
        final id = _id(state.pill);
        if (id == null) return const SizedBox.shrink();
        final theme = Theme.of(context);
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TestId.button(
              id,
              child: FilledButton.tonal(
                onPressed: state.pill.enabled ? session.onPillPressed : null,
                child: Text(state.pill.label!),
              ),
            ),
            if (state.notice != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TestId(
                  AiReviewTestIds.feedMessage,
                  child: Text(state.notice!, style: theme.textTheme.bodySmall),
                ),
              ),
          ],
        );
      },
    );
  }

  static String? _id(AiPill pill) => switch (pill) {
    AiPill.hidden => null,
    AiPill.checking => AiReviewTestIds.feedChecking,
    AiPill.recheck => AiReviewTestIds.feedRecheckButton,
    AiPill.request => AiReviewTestIds.feedRequestButton,
    AiPill.requesting => AiReviewTestIds.feedRequesting,
    AiPill.processing => AiReviewTestIds.feedProcessing,
    AiPill.view => AiReviewTestIds.feedResultButton,
    AiPill.retry => AiReviewTestIds.feedRetryButton,
    AiPill.failed => AiReviewTestIds.feedFailedButton,
  };
}
