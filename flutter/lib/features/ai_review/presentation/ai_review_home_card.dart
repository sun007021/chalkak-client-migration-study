import 'package:flutter/widgets.dart';

import '../domain/ai_review_session.dart';

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
    throw UnimplementedError();
  }
}
