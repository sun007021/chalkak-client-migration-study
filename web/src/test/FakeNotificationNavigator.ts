import type { NotificationNavigator } from '../features/notification/notificationNavigation';

export type NotificationNavigatorCall =
  | { type: 'post'; postId: string; openAiReview: boolean }
  | { type: 'detail'; notificationId: string }
  | { type: 'home' };

export class FakeNotificationNavigator implements NotificationNavigator {
  readonly calls: NotificationNavigatorCall[] = [];

  openPost(target: { postId: string; openAiReview: boolean }): void {
    this.calls.push({ type: 'post', postId: target.postId, openAiReview: target.openAiReview });
  }
  openDetail(notificationId: string): void {
    this.calls.push({ type: 'detail', notificationId });
  }
  openHome(): void {
    this.calls.push({ type: 'home' });
  }
}
