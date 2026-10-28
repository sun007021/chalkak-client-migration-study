import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_models.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_target.dart';
import 'package:flutter_test/flutter_test.dart';

AiReviewResult _result({
  double overall = 7.5,
  List<AiCriterion>? criteria,
  bool distinctive = true,
}) => AiReviewResult(
  overallScore: overall,
  criteria:
      criteria ??
      const [AiCriterion(key: 'COMPOSITION', label: '구도', score: 7.5)],
  distinctivePerspective: distinctive,
  feedback: const AiFeedback(
    summary: '빛을 따라 시선이 흐르는 안정적인 구도',
    strength: '좋았던 점 본문',
    weakness: '아쉬운 점 본문',
    suggestion: '다음엔 이렇게 본문',
  ),
);

void main() {
  group('점수 표시 형식', () {
    test('TC-AIR-049 점수는 소수 첫째 자리로 표시한다(7.5, 10.0, 0.0)', () {
      expect(AiScoreFormat.format(7.5), '7.5');
      expect(AiScoreFormat.format(10), '10.0');
      expect(AiScoreFormat.format(0), '0.0');
      expect(AiScoreFormat.format(8), '8.0');
    });
  });

  group('결과 시트 값', () {
    test('TC-AIR-049 한 줄 요약, 종합 점수, 기준, 섹션이 정해진 순서로 담긴다', () {
      final ui = AiResultUi.from(_result());
      expect(ui.summary, '빛을 따라 시선이 흐르는 안정적인 구도');
      expect(ui.scoreText, '7.5');
      expect(ui.criteria.single.label, '구도');
      expect(ui.criteria.single.scoreText, '7.5');
      expect(ui.sections.map((s) => s.title), [
        Copy.aiResultStrength,
        Copy.aiResultWeakness,
        Copy.aiResultSuggestion,
      ]);
      expect(ui.sections.map((s) => s.body), [
        '좋았던 점 본문',
        '아쉬운 점 본문',
        '다음엔 이렇게 본문',
      ]);
    });

    test('TC-AIR-010 기준 개수를 고정하지 않고 응답 순서대로 담는다(0개, 1개, 3개)', () {
      expect(AiResultUi.from(_result(criteria: const [])).criteria, isEmpty);
      expect(AiResultUi.from(_result()).criteria, hasLength(1));
      final three = AiResultUi.from(
        _result(
          criteria: const [
            AiCriterion(key: 'COMPOSITION', label: '구도', score: 7.5),
            AiCriterion(key: 'LIGHT', label: '빛', score: 8),
            AiCriterion(key: 'SUBJECT', label: '주제 표현', score: 6.5),
          ],
        ),
      );
      expect(three.criteria.map((c) => c.label), ['구도', '빛', '주제 표현']);
      expect(three.criteria.map((c) => c.scoreText), ['7.5', '8.0', '6.5']);
    });

    test('TC-AIR-050 점수 접근성 라벨은 "전체 점수 10점 만점에 7.5점"이다', () {
      expect(AiResultUi.from(_result()).scoreA11yLabel, '전체 점수 10점 만점에 7.5점');
      expect(
        AiResultUi.from(_result(overall: 10)).scoreA11yLabel,
        '전체 점수 10점 만점에 10.0점',
      );
    });

    test('TC-AIR-051 해석 배지는 distinctivePerspective가 true일 때만 켠다', () {
      expect(AiResultUi.from(_result()).showPerspectiveBadge, isTrue);
      expect(
        AiResultUi.from(_result(distinctive: false)).showPerspectiveBadge,
        isFalse,
      );
    });
  });

  group('대상과 상수', () {
    test('TC-AIR-017 REQ-AIR-001 남의 게시물이거나 날짜를 모르면 대상이 없다', () {
      const day = KstDate(2026, 10, 27);
      expect(
        AiReviewTarget.forPost(postId: 'p', isMine: false, topicDate: day),
        isNull,
      );
      expect(
        AiReviewTarget.forPost(postId: 'p', isMine: true, topicDate: null),
        isNull,
      );
      expect(
        AiReviewTarget.forPost(postId: 'p', isMine: true, topicDate: day),
        const AiReviewTarget(postId: 'p', topicDate: day),
      );
    });

    test('TC-AIR-048 폴링 간격 3초, 창 300초 상수(홈 5초가 아니다)', () {
      expect(AppConstants.aiReviewPollInterval, const Duration(seconds: 3));
      expect(AppConstants.aiReviewPollWindow, const Duration(seconds: 300));
    });

    test('TC-AIR-054 AI 영역 문구에는 "AI 리뷰"가 없고 "AI 피드백"으로 통일돼 있다', () {
      final texts = <String>[
        for (final pill in AiPill.values) ?pill.label,
        Copy.aiStartTitle,
        Copy.aiStartTitleRetry,
        Copy.aiStartLine1,
        Copy.aiStartLine2,
        Copy.aiStartLine3,
        Copy.aiFailedTitle,
        Copy.aiFailedNoMore,
        Copy.aiFailedPast,
        Copy.aiCardRequest,
        Copy.aiCardProcessing,
        Copy.aiCardCompleted,
        Copy.aiCardFailed,
        Copy.aiErrorBanned,
        Copy.aiErrorLoad,
        Copy.aiErrorNotFound,
        Copy.aiPollTimeout,
      ];
      for (final text in texts) {
        expect(text, isNot(contains('AI 리뷰')), reason: text);
      }
    });
  });
}
