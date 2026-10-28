import type { PushNotificationPresenter } from '../PushNotificationPresenter';

export class FakePushNotificationPresenter implements PushNotificationPresenter {
  readonly shown: { title: string; body: string }[] = [];

  async present(notification: { title: string; body: string }): Promise<void> {
    this.shown.push(notification);
  }
}
