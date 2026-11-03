import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '../../../shared/copy';
import { foregroundBehaviorFor } from './expoPushMapping';

/** Android 알림 채널 id(push.channel.name 문구). 서버 푸시의 기본 채널(app.config의 defaultChannel)과 같다. */
export const ANDROID_CHANNEL_ID = 'moderation_push';

let channelReady: Promise<void> | null = null;

/** Android 채널을 한 번 만든다. iOS·Web에서는 아무것도 하지 않는다. */
export function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: t('push.channel.name'),
    // 린터가 `export *`로 내보낸 enum을 찾지 못한다(타입은 정상).
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
  }).then(() => undefined);
  return channelReady;
}

/** 앱 루트에서 한 번 부른다: 포그라운드 표시 정책(서버 푸시는 앱이 직접 표시)과 Android 채널. */
export function configureExpoNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => foregroundBehaviorFor(notification),
  });
  ensureAndroidChannel().catch((error: unknown) => {
    console.warn(
      '[expoNotificationSetup] channel failed',
      error instanceof Error ? error.name : 'unknown',
    );
  });
}
