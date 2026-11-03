import type { NotificationNavigator } from '../NotificationNavigator';

export type NotificationNavigatorCall =
  | { type: 'home' }
  | { type: 'post-detail'; postId: string; openAiSheet: boolean }
  | { type: 'notification-detail'; notificationId: string }
  | { type: 'inbox' };

export class FakeNotificationNavigator implements NotificationNavigator {
  readonly calls: NotificationNavigatorCall[] = [];

  openHome(): void {
    this.calls.push({ type: 'home' });
  }

  openPostDetail(target: { postId: string; openAiSheet: boolean }): void {
    this.calls.push({ type: 'post-detail', ...target });
  }

  openNotificationDetail(notificationId: string): void {
    this.calls.push({ type: 'notification-detail', notificationId });
  }

  openInbox(): void {
    this.calls.push({ type: 'inbox' });
  }
}
