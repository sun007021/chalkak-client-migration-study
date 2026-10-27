import type { FeatureFlags } from '../config/FeatureFlags';
import { FixtureSocialLoginClient } from './FixtureSocialLoginClient';
import type { SocialLoginClient } from './SocialLoginClient';

/** `appVariant`가 'e2e'이고 `e2eKakaoIdToken`이 있을 때만 FixtureSocialLoginClient, 없으면 실제 클라이언트를 그대로 돌려준다. */
export function selectSocialLoginClient(
  flags: FeatureFlags,
  real: SocialLoginClient,
): SocialLoginClient {
  // 배포 빌드에 토큰이 잘못 섞여도 Fake로 우회되지 않도록 e2e 변형일 때만 선택한다.
  if (flags.appVariant !== 'e2e' || flags.e2eKakaoIdToken === null) return real;
  return new FixtureSocialLoginClient(flags.e2eKakaoIdToken);
}
