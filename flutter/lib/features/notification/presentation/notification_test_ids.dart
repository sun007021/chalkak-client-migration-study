/// docs/testing/testids.md `notifications`, `notification-detail`, `push-permission` 절의 식별자.
abstract final class NotificationTestIds {
  // notifications
  static const inboxRoot = 'notifications.root';
  static const inboxBackButton = 'notifications.back-button';
  static const inboxList = 'notifications.list';
  static const inboxLoadMoreIndicator = 'notifications.load-more-indicator';
  static const inboxRefreshIndicator = 'notifications.refresh-indicator';
  static const inboxLoading = 'notifications.loading';
  static const inboxEmpty = 'notifications.empty-state';
  static const inboxError = 'notifications.error-state';
  static const inboxRetryButton = 'notifications.retry-button';
  static String item(String id) => 'notifications.item-$id';
  static String itemTitle(String id) => 'notifications.item-title-$id';
  static String itemBody(String id) => 'notifications.item-body-$id';
  static String itemTime(String id) => 'notifications.item-time-$id';
  static String itemThumbnail(String id) => 'notifications.item-thumbnail-$id';

  /// readAt=null일 때만 존재.
  static String itemUnread(String id) => 'notifications.item-unread-$id';

  // notification-detail
  static const detailRoot = 'notification-detail.root';
  static const detailScreenTitle = 'notification-detail.screen-title';
  static const detailBackButton = 'notification-detail.back-button';
  static const detailTitle = 'notification-detail.title';
  static const detailBody = 'notification-detail.body';
  static const detailPhoto = 'notification-detail.photo';
  static const detailRejectionSection = 'notification-detail.rejection-section';
  static const detailRejectionReason = 'notification-detail.rejection-reason';
  static const detailBackToInboxButton =
      'notification-detail.back-to-inbox-button';
  static const detailNotFound = 'notification-detail.not-found-state';
  static const detailLoading = 'notification-detail.loading';
  static const detailError = 'notification-detail.error-state';
  static const detailRetryButton = 'notification-detail.retry-button';

  // push-permission: 앱 안내 대화상자는 임시 규칙(OS 대화상자만, spec 확인 필요 1)에서 쓰지 않는다.
  // 규칙이 바뀌면 testids.md의 push-permission.* 를 쓴다.
}
