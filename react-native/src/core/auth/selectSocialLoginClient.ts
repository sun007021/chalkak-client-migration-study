import type { FeatureFlags } from '../config/FeatureFlags';
import type { SocialLoginClient } from './SocialLoginClient';

/** `e2eKakaoIdToken`이 있으면 FixtureSocialLoginClient, 없으면 실제 클라이언트를 그대로 돌려준다. */
export function selectSocialLoginClient(
  _flags: FeatureFlags,
  _real: SocialLoginClient,
): SocialLoginClient {
  throw new Error('not implemented');
}
