/// docs/testing/testids.md의 전시 식별자. `Semantics(identifier:)`와 `Key`에 같은 값을 쓴다.
abstract final class DisplayTestIds {
  static const root = 'display.root';
  static const dateLabel = 'display.date-label';
  static const prevDateButton = 'display.prev-date-button';
  static const nextDateButton = 'display.next-date-button';
  static const datePickerButton = 'display.date-picker-button';
  static const datePickerSheet = 'display.date-picker-sheet';
  static const datePickerYear = 'display.date-picker-year';
  static const datePickerMonth = 'display.date-picker-month';
  static const datePickerDay = 'display.date-picker-day';
  static const datePickerConfirmButton = 'display.date-picker-confirm-button';
  static const topicTitle = 'display.topic-title';
  static const description = 'display.description';
  static const sortRecentTab = 'display.sort-recent-tab';
  static const sortPopularTab = 'display.sort-popular-tab';
  static const sortRandomTab = 'display.sort-random-tab';
  static const featuredPager = 'display.featured-pager';
  static const grid = 'display.grid';
  static const loadMoreIndicator = 'display.load-more-indicator';
  static const refreshIndicator = 'display.refresh-indicator';
  static const loading = 'display.loading';
  static const emptyState = 'display.empty-state';
  static const errorState = 'display.error-state';
  static const retryButton = 'display.retry-button';

  static String featuredItem(String postId) => 'display.featured-item-$postId';
  static String item(String postId) => 'display.item-$postId';
  static String likeButton(String postId) => 'display.like-button-$postId';
  static String likeCount(String postId) => 'display.like-count-$postId';
}
