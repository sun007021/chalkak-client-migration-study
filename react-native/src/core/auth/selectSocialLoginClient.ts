import type { FeatureFlags } from '../config/FeatureFlags';
import { FixtureSocialLoginClient } from './FixtureSocialLoginClient';
import type { SocialLoginClient } from './SocialLoginClient';

/** `e2eKakaoIdToken`이 있으면 FixtureSocialLoginClient, 없으면 실제 클라이언트를 그대로 돌려준다. */
export function selectSocialLoginClient(
  flags: FeatureFlags,
  real: SocialLoginClient,
): SocialLoginClient {
  return flags.e2eKakaoIdToken === null
    ? real
    : new FixtureSocialLoginClient(flags.e2eKakaoIdToken);
}
