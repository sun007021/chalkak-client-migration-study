export type PhotoAddPermission = 'granted' | 'denied';

/** iOS "사진 추가 전용" 권한과 설정 앱 열기(플랫폼별 허용 차이). Android는 권한 요청 없이 시스템 카메라를 쓴다. */
export interface MediaPermissions {
  requestPhotoAddPermission(): Promise<PhotoAddPermission>;
  openSettings(): Promise<void>;
}
