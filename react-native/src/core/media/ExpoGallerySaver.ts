import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import type { GallerySaveRequest, GallerySaveResult, GallerySaver } from './GallerySaver';

/**
 * 촬영본을 기기 앨범에 `fileName`으로 저장한다(REQ-UPL-014). 파일명을 맞추려고 캐시에 같은 이름으로 복사한 뒤 등록하고 복사본은 지운다.
 * 실패는 던지지 않고 결과로 돌려준다.
 */
export class ExpoGallerySaver implements GallerySaver {
  async save(request: GallerySaveRequest): Promise<GallerySaveResult> {
    let copy: File | null = null;
    try {
      const permission = await requestPermissionsAsync(true, []);
      if (!permission.granted) return 'permission-denied';
      copy = new File(Paths.cache, request.fileName);
      if (copy.exists) copy.delete();
      new File(request.uri).copy(copy);
      await Asset.create(copy.uri);
      return 'saved';
    } catch {
      return 'failed';
    } finally {
      try {
        if (copy?.exists) copy.delete();
      } catch {
        // 캐시 폴더라 시스템이 정리한다.
      }
    }
  }
}
