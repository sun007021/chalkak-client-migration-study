import { login, loginWithKakaoAccount } from '@react-native-seoul/kakao-login';

import type { KakaoSdk, KakaoSdkLoginResult } from './KakaoSdk';
import { mapKakaoSdkError } from './mapKakaoSdkError';

/**
 * `@react-native-seoul/kakao-login` 어댑터(네이티브 모듈이라 단위 테스트 대신 시뮬레이터 E2E로 검증한다).
 * nonce(SHA-256 hex)는 iOS `UserApi.loginWithKakaoTalk(nonce:)`/`loginWithKakaoAccount(nonce:)`,
 * Android `loginWithKakaoTalk(nonce=)`/`loginWithKakaoAccount(nonce)`로 그대로 전달되어 idToken의 nonce claim이 된다.
 *
 * 라이브러리는 톡 설치 여부 조회를 노출하지 않고 `login()`이 내부에서 톡 우선·계정 폴백을 처리한다.
 * 그래서 isTalkAvailable은 항상 true이고 loginWithTalk가 `login()`, loginWithAccount가 `loginWithKakaoAccount()`다.
 */
export class SeoulKakaoSdk implements KakaoSdk {
  async isTalkAvailable(): Promise<boolean> {
    return true;
  }

  loginWithTalk(nonceHash: string): Promise<KakaoSdkLoginResult> {
    return this.run(() => login({ nonce: nonceHash }));
  }

  loginWithAccount(nonceHash: string): Promise<KakaoSdkLoginResult> {
    return this.run(() => loginWithKakaoAccount({ nonce: nonceHash }));
  }

  private async run(
    call: () => Promise<{ idToken?: string | null }>,
  ): Promise<KakaoSdkLoginResult> {
    try {
      const { idToken } = await call();
      return { idToken };
    } catch (error) {
      throw mapKakaoSdkError(error);
    }
  }
}
