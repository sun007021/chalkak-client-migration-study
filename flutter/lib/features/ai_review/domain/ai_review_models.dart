/// 서버 `status`. 알 수 없는 값은 파싱에서 걸러 낸다(REQ-AIR-043).
enum AiReviewStatus { none, processing, completed, failed }

/// 기준 하나(`criteria[]`). 점수는 서버 값 그대로다.
class AiCriterion {
  const AiCriterion({
    required this.key,
    required this.label,
    required this.score,
  });

  final String key;
  final String label;
  final double score;
}

/// 피드백 네 항목. 모두 비어 있지 않아야 한다(REQ-AIR-045).
class AiFeedback {
  const AiFeedback({
    required this.summary,
    required this.strength,
    required this.weakness,
    required this.suggestion,
  });

  final String summary;
  final String strength;
  final String weakness;
  final String suggestion;
}

/// `COMPLETED`일 때만 있는 결과.
class AiReviewResult {
  const AiReviewResult({
    required this.overallScore,
    required this.criteria,
    required this.distinctivePerspective,
    required this.feedback,
  });

  final double overallScore;
  final List<AiCriterion> criteria;
  final bool distinctivePerspective;
  final AiFeedback feedback;
}

/// `GET`·`POST /posts/{postId}/ai-review`의 공통 응답 본문.
///
/// [requestedAt]·[completedAt]은 소수초가 있거나 없는 UTC ISO-8601이다. 폴링 창의 기준이 아니다
/// (REQ-AIR-026). [canRequestAgain]은 필드가 없으면 false다(REQ-AIR-033).
class AiReview {
  const AiReview({
    required this.status,
    this.requestedAt,
    this.completedAt,
    this.result,
    this.canRequestAgain = false,
  });

  final AiReviewStatus status;
  final DateTime? requestedAt;
  final DateTime? completedAt;
  final AiReviewResult? result;
  final bool canRequestAgain;
}
