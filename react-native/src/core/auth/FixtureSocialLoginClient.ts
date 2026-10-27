import type { SocialLoginClient, SocialLoginResult } from './SocialLoginClient';

/** E2E 빌드용. SDK 없이 fixture idToken을 그대로 돌려준다. */
export class FixtureSocialLoginClient implements SocialLoginClient {
  constructor(private readonly idToken: string) {}

  login(_nonceHash: string): Promise<SocialLoginResult> {
    void this.idToken;
    throw new Error('not implemented');
  }
}
