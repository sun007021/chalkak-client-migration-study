import * as Notifications from 'expo-notifications';

import type { NotificationResponseSource, PushData } from '../NotificationResponseSource';
import { pushDataFrom } from './expoPushMapping';

const isDefaultTap = (actionIdentifier: string): boolean =>
  actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;

export class ExpoNotificationResponseSource implements NotificationResponseSource {
  async consumeInitial(): Promise<PushData | null> {
    const response = Notifications.getLastNotificationResponse();
    if (response === null || !isDefaultTap(response.actionIdentifier)) return null;
    // 다음 시작이나 재조회에서 같은 탭을 다시 소비하지 않게 지운다.
    Notifications.clearLastNotificationResponse();
    return pushDataFrom(response.notification);
  }

  subscribe(listener: (data: PushData) => void): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isDefaultTap(response.actionIdentifier)) listener(pushDataFrom(response.notification));
    });
    return () => subscription.remove();
  }
}
