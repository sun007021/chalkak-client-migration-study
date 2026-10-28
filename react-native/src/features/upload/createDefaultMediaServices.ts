import { ExpoGallerySaver } from '../../core/media/ExpoGallerySaver';
import { ExpoImagePicker } from '../../core/media/ExpoImagePicker';
import { ExpoLocalFiles } from '../../core/media/ExpoLocalFiles';
import { ExpoMediaPermissions } from '../../core/media/ExpoMediaPermissions';
import { SystemMonotonicClock } from '../../core/time/Clock';
import { ExpoImageEngine } from '../photo-edit/ExpoImageEngine';
import type { MediaServices } from './MediaServices';

/** 실제 기기용 네이티브 경계(expo-image-picker, expo-image-manipulator, expo-media-library, expo-file-system). 테스트는 Fake를 `overrides.media`로 넣는다. */
export function createDefaultMediaServices(platform: 'ios' | 'android'): MediaServices {
  return {
    picker: new ExpoImagePicker(platform),
    gallery: new ExpoGallerySaver(),
    permissions: new ExpoMediaPermissions(),
    files: new ExpoLocalFiles(),
    engine: new ExpoImageEngine(),
    monotonic: new SystemMonotonicClock(),
    platform,
  };
}
