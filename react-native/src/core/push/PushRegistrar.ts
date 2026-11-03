/** 푸시 기기 등록(notification-push.md). 실제 구현은 DevicePushRegistrar. */
export interface PushRegistrar {
  /** 인증 세션이 생겼을 때(콜드 스타트, 로그인 성공) 불린다. 실패해도 호출자 흐름을 막지 않는다. */
  registerDevice(): Promise<void>;
  /** 로그아웃·탈퇴 때 중복 등록 제거 캐시를 비운다(REQ-AUTH-035). 서버 호출 아님. */
  resetRegistrationCache(): void;
  /** 토큰 갱신·포그라운드 복귀 같은 상시 트리거를 건다(없으면 시작/로그인 때의 registerDevice만). 반환 함수로 해제한다. */
  start?(): () => void;
}
