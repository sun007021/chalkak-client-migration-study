import type { KakaoSdk, KakaoSdkLoginResult } from '../KakaoSdk';

type Step = KakaoSdkLoginResult | Error;

/** 호출 순서를 `calls`에 남기고, 각 단계의 결과/오류를 미리 정해 둔다. */
export class FakeKakaoSdk implements KakaoSdk {
  readonly calls: string[] = [];
  readonly nonces: string[] = [];
  talkAvailable: boolean | Error = true;
  talkResult: Step = { idToken: 'talk-id-token' };
  accountResult: Step = { idToken: 'account-id-token' };

  async isTalkAvailable(): Promise<boolean> {
    this.calls.push('isTalkAvailable');
    if (this.talkAvailable instanceof Error) throw this.talkAvailable;
    return this.talkAvailable;
  }

  async loginWithTalk(nonceHash: string): Promise<KakaoSdkLoginResult> {
    this.calls.push('loginWithTalk');
    this.nonces.push(nonceHash);
    if (this.talkResult instanceof Error) throw this.talkResult;
    return this.talkResult;
  }

  async loginWithAccount(nonceHash: string): Promise<KakaoSdkLoginResult> {
    this.calls.push('loginWithAccount');
    this.nonces.push(nonceHash);
    if (this.accountResult instanceof Error) throw this.accountResult;
    return this.accountResult;
  }
}
