import * as Notifications from 'expo-notifications';

import type { PushTokenProvider } from '../PushTokenProvider';
import { fcmTokenFrom } from './expoPushMapping';

/** 기기 푸시 토큰(getDevicePushTokenAsync). 서버는 FCM 토큰을 받으므로 Android만 값을 돌려준다. */
export class ExpoPushTokenProvider implements PushTokenProvider {
  async getToken(): Promise<string | null> {
    try {
      return fcmTokenFrom(await Notifications.getDevicePushTokenAsync());
    } catch (error) {
      // 시뮬레이터·Google 서비스 없음 등: 토큰이 없는 것으로 보고 다음 트리거에 다시 시도한다.
      console.warn(
        '[ExpoPushTokenProvider] token unavailable',
        error instanceof Error ? error.name : 'unknown',
      );
      return null;
    }
  }

  subscribe(listener: (token: string) => void): () => void {
    const subscription = Notifications.addPushTokenListener((token) => {
      const mapped = fcmTokenFrom(token);
      if (mapped !== null) listener(mapped);
    });
    return () => subscription.remove();
  }
}
