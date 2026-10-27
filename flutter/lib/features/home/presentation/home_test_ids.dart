/// docs/testing/testids.md 홈 절의 식별자.
abstract final class HomeTestIds {
  static const root = 'home.root';
  static const scroll = 'home.scroll';
  static const notificationButton = 'home.notification-button';
  static const notificationUnreadDot = 'home.notification-unread-dot';
  static const topicDate = 'home.topic-date';
  static const topicTitle = 'home.topic-title';
  static const loading = 'home.loading';
  static const errorState = 'home.error-state';
  static const retryButton = 'home.retry-button';
  static const refreshIndicator = 'home.refresh-indicator';

  static const heroLoading = 'home.hero-loading';
  static const heroNoOpenTopic = 'home.hero-no-open-topic';
  static const heroEmpty = 'home.hero-empty';
  static const heroUploadButton = 'home.hero-upload-button';
  static const heroProcessing = 'home.hero-processing';
  static const heroPhoto = 'home.hero-photo';
  static const heroPendingBadge = 'home.hero-pending-badge';
  static const heroError = 'home.hero-error';
  static const heroRetryButton = 'home.hero-retry-button';

  static const weekSection = 'home.week-section';
  static const weekError = 'home.week-error';
  static String weekDay(String yyyyMmDd) => 'home.week-day-$yyyyMmDd';
  static String weekPhoto(String yyyyMmDd) => 'home.week-photo-$yyyyMmDd';

  static const rankingSection = 'home.ranking-section';
  static const rankingMoreLink = 'home.ranking-more-link';
  static const rankingEmpty = 'home.ranking-empty';
  static String rankingItem(String postId) => 'home.ranking-item-$postId';

  static const popularSection = 'home.popular-section';
  static const popularMoreLink = 'home.popular-more-link';
  static String popularItem(String postId) => 'home.popular-item-$postId';

  static const aiCard = 'home.ai-card';

  static const issueSection = 'home.issue-section';
  static String issueItem(String bannerId) => 'home.issue-item-$bannerId';
}
