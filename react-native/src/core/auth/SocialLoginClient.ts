export type SocialLoginResult = { kind: 'success'; idToken: string } | { kind: 'cancelled' };

/** 사용자 취소가 아닌 SDK 실패. config는 idToken 없음·카카오 설정 누락, failed는 그 밖. */
export class SocialLoginError extends Error {
  constructor(readonly reason: 'config' | 'failed') {
    super(`social login ${reason}`);
    this.name = 'SocialLoginError';
  }
}

/** 소셜 로그인 SDK 경계. 카카오만 구현한다. 취소는 결과로, 실패는 SocialLoginError로 돌려준다. */
export interface SocialLoginClient {
  /** `nonceHash`는 SHA-256 소문자 hex. 서버용 rawNonce는 이 인터페이스에 오지 않는다. */
  login(nonceHash: string): Promise<SocialLoginResult>;
}
