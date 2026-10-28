import '../../../core/copy/ko.g.dart';
import 'ai_review_models.dart';

/// 알약·카드가 보여 줄 상태(spec "알약/카드 상태").
enum AiPill {
  /// 대상 없음(남의 게시물·게스트·지난 주제의 NONE·404).
  hidden(null, false),

  /// 첫 `GET` 진행(REQ-AIR-008).
  checking(Copy.aiPillChecking, false),

  /// 첫 `GET`이 404 외 오류로 실패(REQ-AIR-016). 누르면 `GET`을 다시 보낸다.
  recheck(Copy.aiPillRecheck, true),

  /// NONE + 오늘 주제(REQ-AIR-009).
  request(Copy.aiPillRequest, true),

  /// `POST` 진행(REQ-AIR-010).
  requesting(Copy.aiPillRequesting, false),

  /// PROCESSING(300초 창이 끝나도 유지, REQ-AIR-027).
  processing(Copy.aiPillProcessing, false),

  /// COMPLETED(REQ-AIR-012).
  view(Copy.aiPillView, true),

  /// FAILED + `canRequestAgain` + 오늘 주제(REQ-AIR-013).
  retry(Copy.aiPillRetry, true),

  /// FAILED, 재요청 불가 또는 지난 주제(REQ-AIR-014).
  failed(Copy.aiPillFailed, true);

  const AiPill(this.label, this.enabled);

  /// 알약 문구(`ai.pill.*`). [hidden]은 null.
  final String? label;

  /// 눌릴 수 있는가.
  final bool enabled;
}

/// 결과 시트의 기준 한 줄. 점수는 소수 첫째 자리 문자열이다.
class AiCriterionRow {
  const AiCriterionRow({
    required this.key,
    required this.label,
    required this.scoreText,
  });

  /// 서버 기준 키(`criteria-item-{key}` testID에 쓴다).
  final String key;
  final String label;
  final String scoreText;
}

/// 결과 시트의 본문 섹션(제목은 `ai.result.strength|weakness|suggestion`).
class AiResultSection {
  const AiResultSection({required this.title, required this.body});

  final String title;
  final String body;
}

/// 점수 표시 형식. 서버 값을 다시 계산하지 않고 소수 첫째 자리로 찍는다
/// (7.5 -> "7.5", 10 -> "10.0", 0 -> "0.0", 반올림 없음 가정, spec 확인 필요 [추정]).
abstract final class AiScoreFormat {
  static String format(double score) => score.toStringAsFixed(1);
}

/// 결과 시트가 그리는 값(REQ-AIR-037~040). 표시 순서대로 담는다.
class AiResultUi {
  const AiResultUi({
    required this.summary,
    required this.scoreText,
    required this.criteria,
    required this.showPerspectiveBadge,
    required this.sections,
  });

  /// 서버 결과를 화면 값으로 바꾼다. `criteria`는 응답 순서·개수 그대로(0개도 가능),
  /// `sections`는 좋았던 점, 아쉬운 점, 다음엔 이렇게 순서다.
  factory AiResultUi.from(AiReviewResult result) {
    final feedback = result.feedback;
    return AiResultUi(
      summary: feedback.summary,
      scoreText: AiScoreFormat.format(result.overallScore),
      criteria: [
        for (final c in result.criteria)
          AiCriterionRow(
            key: c.key,
            label: c.label,
            scoreText: AiScoreFormat.format(c.score),
          ),
      ],
      showPerspectiveBadge: result.distinctivePerspective,
      sections: [
        AiResultSection(title: Copy.aiResultStrength, body: feedback.strength),
        AiResultSection(title: Copy.aiResultWeakness, body: feedback.weakness),
        AiResultSection(
          title: Copy.aiResultSuggestion,
          body: feedback.suggestion,
        ),
      ],
    );
  }

  /// `feedback.summary`(굵은 제목).
  final String summary;
  final String scoreText;
  final List<AiCriterionRow> criteria;

  /// `distinctivePerspective`가 true일 때만 배지를 그린다(REQ-AIR-038).
  final bool showPerspectiveBadge;
  final List<AiResultSection> sections;

  /// "전체 점수 10점 만점에 {X}점"(`ai.result.score-a11y`의 `{X}`를 [scoreText]로 바꾼다).
  String get scoreA11yLabel =>
      Copy.fill(Copy.aiResultScoreA11y, {'X': scoreText});
}

/// 열린 시트. 동시에 하나만 열린다.
sealed class AiSheet {
  const AiSheet();
}

/// 시작 시트. [retry]면 제목이 "AI 피드백을 재요청할까요?"다(REQ-AIR-018).
final class AiStartSheet extends AiSheet {
  const AiStartSheet({required this.retry});

  final bool retry;
}

final class AiResultSheet extends AiSheet {
  const AiResultSheet(this.content);

  final AiResultUi content;
}

/// 실패 시트. [reason]은 `ai.failed.no-more`(`canRequestAgain=false`) 또는
/// `ai.failed.past`(지난 주제) 문구이고, 둘 다 아니면 null이다(REQ-AIR-015).
final class AiFailedSheet extends AiSheet {
  const AiFailedSheet({this.reason});

  final String? reason;
}

/// 세션이 화면에 내보내는 상태.
class AiReviewState {
  const AiReviewState({
    this.pill = AiPill.hidden,
    this.sheet,
    this.criteriaDialogOpen = false,
    this.notice,
    this.review,
  });

  final AiPill pill;
  final AiSheet? sheet;

  /// 결과 시트 위의 "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그(REQ-AIR-041).
  final bool criteriaDialogOpen;

  /// 폴링 창이 끝난 뒤의 고정 안내 `Copy.aiPollTimeout`, 아니면 null(REQ-AIR-027).
  final String? notice;

  /// 현재 대상에 대해 마지막으로 확인한 서버 응답. 첫 응답 전·대상 변경 직후·404는 null.
  final AiReview? review;
}
