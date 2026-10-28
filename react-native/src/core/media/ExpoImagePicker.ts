import * as ExpoPicker from 'expo-image-picker';

import { CameraPermissionDeniedError, type ImagePicker, type PickResult } from './ImagePicker';

const OPTIONS: ExpoPicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  allowsEditing: false,
  quality: 1,
  exif: false,
};

/**
 * expo-image-picker 구현. 앨범은 권한이 필요 없는 시스템 선택기(iOS PHPicker, Android 포토 피커)로 한 장을 고른다.
 * 카메라는 두 플랫폼 모두 카메라 권한을 먼저 요청한다(expo-image-picker 58.0.10의 launchCameraAsync는 Android에서도
 * ensureCameraPermissionsAreGranted()로 CAMERA 권한을 요구한다). 거부하면 CameraPermissionDeniedError를 던지고 화면이 따로 안내한다.
 * 기기에 카메라가 있는지는 동기로 알 수 없어 항상 true다(시뮬레이터의 촬영 실패는 오류 문구로 보인다).
 */
export class ExpoImagePicker implements ImagePicker {
  readonly cameraAvailable = true;

  async pickFromLibrary(): Promise<PickResult> {
    return toResult(await ExpoPicker.launchImageLibraryAsync(OPTIONS));
  }

  async capture(): Promise<PickResult> {
    const permission = await ExpoPicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraPermissionDeniedError();
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
