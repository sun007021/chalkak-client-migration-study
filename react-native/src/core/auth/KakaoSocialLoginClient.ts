import type { KakaoSdk } from './KakaoSdk';
import type { SocialLoginClient, SocialLoginResult } from './SocialLoginClient';

/** 톡 로그인 우선, 취소 아닌 실패는 계정 로그인으로 폴백, 취소는 폴백 없음(REQ-AUTH-005~006). */
export class KakaoSocialLoginClient implements SocialLoginClient {
  constructor(private readonly sdk: KakaoSdk) {}

  login(_nonceHash: string): Promise<SocialLoginResult> {
    void this.sdk;
    throw new Error('not implemented');
  }
}
