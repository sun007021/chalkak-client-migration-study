import type { SocialLoginClient, SocialLoginResult } from '../SocialLoginClient';

/** `outcome`이 Error면 던지고 아니면 돌려준다. `gate`가 있으면 풀릴 때까지 대기한다(진행 중 상태 검증). */
export class FakeSocialLoginClient implements SocialLoginClient {
  readonly nonceHashes: string[] = [];
  outcome: SocialLoginResult | Error = { kind: 'success', idToken: 'fake-id-token' };
  gate: Promise<void> | null = null;

  async login(nonceHash: string): Promise<SocialLoginResult> {
    this.nonceHashes.push(nonceHash);
    if (this.gate) await this.gate;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}
