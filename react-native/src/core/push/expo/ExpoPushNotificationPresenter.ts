import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PushData } from '../NotificationResponseSource';
import type { PushNotificationPresenter } from '../PushNotificationPresenter';
import { ANDROID_CHANNEL_ID, ensureAndroidChannel } from './expoNotificationSetup';

export class ExpoPushNotificationPresenter implements PushNotificationPresenter {
  async present(notification: { title: string; body: string }, data?: PushData): Promise<void> {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        // 탭하면 원래 푸시와 같은 목적지로 가도록 data를 싣는다.
        data: data ? { ...data } : {},
      },
      // 즉시 표시(trigger 없음). Android만 채널을 지정한다.
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  }
}
