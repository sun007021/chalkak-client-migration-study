export type GallerySaveRequest = {
  uri: string;
  /** `chalkak-photo-*.jpg` 규칙(REQ-UPL-014). */
  fileName: string;
};

/** 실패는 throw하지 않고 결과로 돌려준다. */
export type GallerySaveResult = 'saved' | 'permission-denied' | 'failed';

/** 촬영본을 기기 앨범에 JPEG로 저장하는 네이티브 경계. 구현 예: expo-media-library. */
export interface GallerySaver {
  save(request: GallerySaveRequest): Promise<GallerySaveResult>;
}
