import * as Notifications from 'expo-notifications';

import type { PushMessage, PushMessageSource } from '../PushMessageSource';
import { isRemotePush, pushMessageFrom } from './expoPushMapping';

export class ExpoPushMessageSource implements PushMessageSource {
  subscribe(listener: (message: PushMessage) => void): () => void {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      // 앱이 직접 만든 로컬 알림(ExpoPushNotificationPresenter)은 다시 처리하지 않는다.
      if (isRemotePush(notification)) listener(pushMessageFrom(notification));
    });
    return () => subscription.remove();
  }
}
