import * as ExpoPicker from 'expo-image-picker';

import type { ImagePicker, PickResult } from './ImagePicker';

const OPTIONS: ExpoPicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  allowsEditing: false,
  quality: 1,
  exif: false,
};

/**
 * expo-image-picker 구현. 앨범은 권한이 필요 없는 시스템 선택기(iOS PHPicker, Android 포토 피커)로 한 장을 고른다.
 * 카메라는 iOS만 카메라 권한을 요청하고(거부면 던진다 -> 화면은 준비 실패 문구), Android는 CAMERA 권한 없이 시스템 카메라 앱을 연다.
 * 기기에 카메라가 있는지는 동기로 알 수 없어 항상 true다(시뮬레이터의 촬영 실패는 오류 문구로 보인다).
 */
export class ExpoImagePicker implements ImagePicker {
  readonly cameraAvailable = true;

  constructor(private readonly platform: 'ios' | 'android') {}

  async pickFromLibrary(): Promise<PickResult> {
    return toResult(await ExpoPicker.launchImageLibraryAsync(OPTIONS));
  }

  async capture(): Promise<PickResult> {
    if (this.platform === 'ios') {
      const permission = await ExpoPicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('camera permission denied');
    }
    return toResult(await ExpoPicker.launchCameraAsync(OPTIONS));
  }
}

function toResult(result: ExpoPicker.ImagePickerResult): PickResult {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { kind: 'cancelled' };
  return {
    kind: 'picked',
    image: {
      uri: asset.uri,
      width: asset.width > 0 ? asset.width : null,
      height: asset.height > 0 ? asset.height : null,
    },
  };
}
