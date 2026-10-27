/** 푸시 기기 등록(notification-push.md 소유). 이 PR은 호출 여부만 다룬다. */
export interface PushRegistrar {
  /** 인증 세션이 생겼을 때(콜드 스타트, 로그인 성공) 불린다. 실패해도 호출자 흐름을 막지 않는다. */
  registerDevice(): Promise<void>;
  /** 로그아웃·탈퇴 때 중복 등록 제거 캐시를 비운다(REQ-AUTH-035). 서버 호출 아님. */
  resetRegistrationCache(): void;
}
