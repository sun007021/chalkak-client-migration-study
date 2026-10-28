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

  async openSystemSettings(): Promise<void> {
    await Linking.openSettings();
  }
}
