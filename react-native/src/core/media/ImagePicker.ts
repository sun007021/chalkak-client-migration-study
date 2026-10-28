/** 시스템 사진 선택기·카메라가 돌려주는 사진 한 장. 크기를 모르면 null(읽는 쪽이 ImageEngine.readBounds로 확인한다). */
export type PickedImage = { uri: string; width: number | null; height: number | null };

export type PickResult = { kind: 'picked'; image: PickedImage } | { kind: 'cancelled' };

/**
 * 사진을 고르거나 찍는 네이티브 경계(REQ-UPL-012~013). 구현 예: expo-image-picker.
 * 앨범 선택기는 권한이 필요 없는 시스템 선택기로 한 장만 고른다. 사용자가 닫으면 'cancelled'이고 오류가 아니다.
 */
export interface ImagePicker {
  /** 카메라를 쓸 수 없는 기기(시뮬레이터 등)에서는 false -> 카메라 버튼을 그리지 않는다. */
  readonly cameraAvailable: boolean;
  pickFromLibrary(): Promise<PickResult>;
  capture(): Promise<PickResult>;
}

/** 사용자가 카메라 권한을 거부했다. 선택기 오류 중 이것만 따로 안내한다. */
export class CameraPermissionDeniedError extends Error {
  constructor() {
    super('camera permission denied');
    this.name = 'CameraPermissionDeniedError';
  }
}
