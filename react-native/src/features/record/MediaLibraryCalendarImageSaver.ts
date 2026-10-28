import { Album, Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { ImagePermissionDeniedError, type CalendarImageSaver } from './CalendarImage';

/** Android는 MediaStore의 Pictures/Chalkak에 저장한다(REQ-REC-038). */
const ANDROID_ALBUM = 'Chalkak';

/**
 * 이 API 이상에서는 권한 요청을 건너뛴다. REQ-REC-038은 "API 28 이하"에서만 `WRITE_EXTERNAL_STORAGE`를 요청한다고 하지만
 * 라이브러리(expo-media-library 58)가 `WRITE_EXTERNAL_STORAGE`를 쓰는 범위와 `requestLegacyExternalStorage` 때문에
 * 29 이하는 요청하고 30(Android 11)부터 건너뛴다(팀장 결정, 실기기 확인 필요: README).
 */
const MEDIASTORE_WRITE_API = 30;

/**
 * 사진 보관함 저장(expo-media-library 번들 버전).
 * - iOS: 사진 추가 전용 권한(`writeOnly`)만 요청하고 보관함에 추가한다.
 * - Android 10(API 29) 이하: `WRITE_EXTERNAL_STORAGE`를 요청한다. Android 11(API 30) 이상은 권한 없이 Pictures/Chalkak에 쓴다.
 * - 권한 거부(다시 묻지 않기 포함)는 ImagePermissionDeniedError, 그 밖의 실패는 그대로 던진다.
 * PR 7(업로드)의 core/media(GallerySaver, MediaPermissions)와 같은 개념이다. 그쪽이 main에 들어오면 합친다.
 */
export class MediaLibraryCalendarImageSaver implements CalendarImageSaver {
  async save(image: { fileName: string; bytes: Uint8Array }): Promise<void> {
    await this.ensurePermission();
    // 보관함은 파일 경로로 받으므로 캐시에 임시 파일을 만들고 끝나면 지운다.
    const file = new File(Paths.cache, image.fileName);
    try {
      file.create({ overwrite: true });
      file.writeSync(image.bytes);
      if (Platform.OS === 'android') {
        await Album.create(ANDROID_ALBUM, [file.uri]);
      } else {
        await Asset.create(file.uri);
      }
    } finally {
      try {
        file.delete();
      } catch {
        // 임시 파일 정리 실패는 저장 결과와 무관하다(캐시라 시스템이 지운다).
      }
    }
  }

  private async ensurePermission(): Promise<void> {
    if (Platform.OS === 'android' && Number(Platform.Version) >= MEDIASTORE_WRITE_API) return;
    const current = await getPermissionsAsync(true);
    if (current.granted) return;
    const next = current.canAskAgain ? await requestPermissionsAsync(true) : current;
    if (!next.granted)
      throw new ImagePermissionDeniedError('photo library write permission denied');
  }
}
