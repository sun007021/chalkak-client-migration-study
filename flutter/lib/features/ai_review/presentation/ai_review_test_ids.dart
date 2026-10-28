/// docs/testing/testids.md의 AI 피드백 식별자(상세 알약, 홈 카드, 시작·결과·실패 시트).
abstract final class AiReviewTestIds {
  // 상세 알약
  static const feedRequestButton = 'feed.ai-request-button';
  static const feedChecking = 'feed.ai-checking';
  static const feedRequesting = 'feed.ai-requesting';
  static const feedProcessing = 'feed.ai-processing';
  static const feedResultButton = 'feed.ai-result-button';
  static const feedRetryButton = 'feed.ai-retry-button';
  static const feedFailedButton = 'feed.ai-failed-button';
  static const feedRecheckButton = 'feed.ai-recheck-button';

  /// 알약 아래 안내(폴링 창 종료 안내, 조회 불가 등).
  static const feedMessage = 'feed.ai-message';

  // 홈 카드
  static const homeCard = 'home.ai-card';
  static const homeRequestButton = 'home.ai-request-button';
  static const homeProcessing = 'home.ai-processing';
  static const homeCompleted = 'home.ai-completed';
  static const homeDetailButton = 'home.ai-detail-button';
  static const homeFailed = 'home.ai-failed';
  static const homeRetryButton = 'home.ai-retry-button';

  // 시작 시트
  static const startSheetRoot = 'ai-start-sheet.root';
  static const startSheetDescription = 'ai-start-sheet.description';
  static const startSheetStartButton = 'ai-start-sheet.start-button';
  static const startSheetCloseButton = 'ai-start-sheet.close-button';

  // 결과 시트
  static const resultSheetRoot = 'ai-result-sheet.root';
  static const resultSheetOverallScore = 'ai-result-sheet.overall-score';
  static String resultSheetCriteriaItem(String key) =>
      'ai-result-sheet.criteria-item-$key';
  static const resultSheetDistinctiveBadge =
      'ai-result-sheet.distinctive-badge';
  static const resultSheetFeedbackSummary = 'ai-result-sheet.feedback-summary';
  static const resultSheetFeedbackStrength =
      'ai-result-sheet.feedback-strength';
  static const resultSheetFeedbackWeakness =
      'ai-result-sheet.feedback-weakness';
  static const resultSheetFeedbackSuggestion =
      'ai-result-sheet.feedback-suggestion';
  static const resultSheetCriteriaInfoButton =
      'ai-result-sheet.criteria-info-button';
  static const resultSheetCriteriaDialog = 'ai-result-sheet.criteria-dialog';
  static const resultSheetCloseButton = 'ai-result-sheet.close-button';

  // 실패 시트
  static const failedSheetRoot = 'ai-failed-sheet.root';
  static const failedSheetMessage = 'ai-failed-sheet.message';
  static const failedSheetRetryButton = 'ai-failed-sheet.retry-button';
  static const failedSheetConfirmButton = 'ai-failed-sheet.confirm-button';
}
