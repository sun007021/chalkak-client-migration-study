import { Linking } from 'react-native';
import { requestPermissionsAsync } from 'expo-media-library';

import type { MediaPermissions, PhotoAddPermission } from './MediaPermissions';

/** iOS "사진 추가 전용" 권한(expo-media-library writeOnly)과 설정 앱 열기. */
export class ExpoMediaPermissions implements MediaPermissions {
  async requestPhotoAddPermission(): Promise<PhotoAddPermission> {
    try {
      const response = await requestPermissionsAsync(true, []);
      return response.granted ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  async openSettings(): Promise<void> {
    await Linking.openSettings();
  }
}
