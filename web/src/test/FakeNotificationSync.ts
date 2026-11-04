import type { NotificationSync } from '../features/notification/notificationSync';

/** 알림 화면이 다른 화면을 갱신한 횟수를 센다. */
export class FakeNotificationSync implements NotificationSync {
  unreadRefreshes = 0;
  inboxRefreshes = 0;

  async refreshUnread(): Promise<void> {
    this.unreadRefreshes += 1;
  }

  async refreshInbox(): Promise<void> {
    this.inboxRefreshes += 1;
  }
}
