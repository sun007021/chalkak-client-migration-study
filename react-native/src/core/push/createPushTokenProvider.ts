import type { AppInfo } from '../config/AppInfo';
import { ExpoPushTokenProvider } from './expo/ExpoPushTokenProvider';
import { FirebaseMessagingTokenProvider } from './firebase/FirebaseMessagingTokenProvider';
import type { PushTokenProvider } from './PushTokenProvider';

/** iOS는 Firebase 설정으로 빌드했을 때만 FCM 공급자, 그 밖에는 기존 공급자(iOS는 null, Android는 FCM). */
export function createPushTokenProvider(appInfo: AppInfo): PushTokenProvider {
  return appInfo.platform === 'ios' && appInfo.iosFcmEnabled
    ? new FirebaseMessagingTokenProvider()
    : new ExpoPushTokenProvider();
}
