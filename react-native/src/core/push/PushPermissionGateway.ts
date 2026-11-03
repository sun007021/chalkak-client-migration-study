export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * OS 알림 권한(REQ-PUSH-003). 구현은 expo-notifications를 감싼다.
 * Android 12 이하와 Web은 요청이 없으므로 status()가 항상 'granted'이고 request()는 아무것도 하지 않는다.
 */
export interface PushPermissionGateway {
  status(): Promise<PushPermissionStatus>;
  /** OS 권한 대화상자를 띄운다. 호출 자체가 실패하면 reject한다. */
  request(): Promise<PushPermissionStatus>;
  /** 시스템 알림 설정 화면(앱 설정)을 연다. 설정 탭에서 권한이 꺼진 상태로 스위치를 켤 때 쓴다(REQ-SET-015). */
  openSystemSettings(): Promise<void>;
}
