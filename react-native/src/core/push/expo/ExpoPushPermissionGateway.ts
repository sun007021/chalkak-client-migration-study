import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { PushPermissionGateway, PushPermissionStatus } from '../PushPermissionGateway';
import { ensureAndroidChannel } from './expoNotificationSetup';
import { permissionStatusFrom } from './expoPushMapping';

const ANDROID_RUNTIME_PERMISSION_API_LEVEL = 33;

/** Web과 Android 12 이하는 런타임 권한이 없어 항상 허용으로 본다(REQ-PUSH-003). */
function hasRuntimePermission(): boolean {
  if (Platform.OS === 'ios') return true;
  return (
    Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_RUNTIME_PERMISSION_API_LEVEL
  );
}

export class ExpoPushPermissionGateway implements PushPermissionGateway {
  async status(): Promise<PushPermissionStatus> {
    if (!hasRuntimePermission()) return 'granted';
    return permissionStatusFrom(await Notifications.getPermissionsAsync());
  }

  async request(): Promise<PushPermissionStatus> {
    if (!hasRuntimePermission()) return 'granted';
    // Android 13+는 채널이 있어야 권한 대화상자가 뜬다.
    await ensureAndroidChannel();
    return permissionStatusFrom(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    );
  }

  /**
   * 시스템 설정을 연다. Android는 앱의 알림 설정 화면으로 바로 보내고(없는 기기나 실패하면),
   * iOS와 그 밖에는 앱 설정(`Linking.openSettings()`)으로 보낸다.
   */
  async openSystemSettings(): Promise<void> {
    const packageName = Constants.expoConfig?.android?.package;
    if (Platform.OS === 'android' && packageName) {
      try {
        await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
          { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
        ]);
        return;
      } catch {
        // 알림 설정 화면을 열 수 없으면 일반 앱 설정으로 넘어간다.
      }
    }
    await Linking.openSettings();
  }
}
