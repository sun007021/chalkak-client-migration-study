import type { GallerySaver } from '../../core/media/GallerySaver';
import type { ImagePicker } from '../../core/media/ImagePicker';
import type { LocalFiles } from '../../core/media/LocalFiles';
import type { MediaPermissions } from '../../core/media/MediaPermissions';
import type { MonotonicClock } from '../../core/media/MonotonicClock';
import type { ImageEngine } from '../photo-edit/ImageEngine';

/**
 * 업로드·편집이 쓰는 네이티브 경계 묶음. 기본 구현(expo-image-picker, expo-image-manipulator, expo-media-library,
 * expo-file-system)은 구현 단계에서 AppContainer가 조립하고, 테스트는 Fake를 `overrides.media`로 넣는다.
 */
export interface MediaServices {
  picker: ImagePicker;
  gallery: GallerySaver;
  permissions: MediaPermissions;
  files: LocalFiles;
  engine: ImageEngine;
  monotonic: MonotonicClock;
  /** 카메라 저장 권한 흐름이 다르다(iOS: 사진 추가 권한 + 안내, Android: 권한 요청 없이 시스템 카메라). */
  platform: 'ios' | 'android';
}
