import * as Notifications from 'expo-notifications';

import type { NotificationResponseSource, PushData } from '../NotificationResponseSource';
import { createResponseDeduper, pushDataFrom } from './expoPushMapping';

const isDefaultTap = (actionIdentifier: string): boolean =>
  actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;

export class ExpoNotificationResponseSource implements NotificationResponseSource {
  private readonly isNew = createResponseDeduper();

  async consumeInitial(): Promise<PushData | null> {
    const response = Notifications.getLastNotificationResponse();
    if (response === null || !isDefaultTap(response.actionIdentifier)) return null;
    // 다음 시작이나 재조회에서 같은 탭을 다시 소비하지 않게 지운다.
    Notifications.clearLastNotificationResponse();
    if (!this.isNew(response.notification.request.identifier)) return null;
    return pushDataFrom(response.notification);
  }

  subscribe(listener: (data: PushData) => void): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!isDefaultTap(response.actionIdentifier)) return;
      if (this.isNew(response.notification.request.identifier))
        listener(pushDataFrom(response.notification));
    });
    return () => subscription.remove();
  }
}
