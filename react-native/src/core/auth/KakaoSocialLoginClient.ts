import { type KakaoSdk, KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';
import {
  type SocialLoginClient,
  SocialLoginError,
  type SocialLoginResult,
} from './SocialLoginClient';

/** 톡 로그인 우선, 취소 아닌 실패는 계정 로그인으로 폴백, 취소는 폴백 없음(REQ-AUTH-005~006). */
export class KakaoSocialLoginClient implements SocialLoginClient {
  constructor(private readonly sdk: KakaoSdk) {}

  async login(nonceHash: string): Promise<SocialLoginResult> {
    try {
      const idToken = await this.loginWithFallback(nonceHash);
      if (!idToken) throw new SocialLoginError('config');
      return { kind: 'success', idToken };
    } catch (error) {
      if (error instanceof KakaoSdkCancelledError) return { kind: 'cancelled' };
      if (error instanceof SocialLoginError) throw error;
      if (error instanceof KakaoSdkConfigError) throw new SocialLoginError('config');
      throw new SocialLoginError('failed');
    }
  }

  private async loginWithFallback(nonceHash: string): Promise<string | null | undefined> {
    if (await this.isTalkAvailable()) {
      try {
        return (await this.sdk.loginWithTalk(nonceHash)).idToken;
      } catch (error) {
        // 취소와 설정 누락은 계정 로그인으로 넘어가도 달라지지 않는다.
        if (error instanceof KakaoSdkCancelledError || error instanceof KakaoSdkConfigError) {
          throw error;
        }
      }
    }
    return (await this.sdk.loginWithAccount(nonceHash)).idToken;
  }

  private async isTalkAvailable(): Promise<boolean> {
    try {
      return await this.sdk.isTalkAvailable();
    } catch {
      return false;
    }
  }
}
