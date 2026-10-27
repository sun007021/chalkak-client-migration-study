import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeNonceGenerator } from '../../../core/auth/__testing__/FakeNonceGenerator';
import { FakeSocialLoginClient } from '../../../core/auth/__testing__/FakeSocialLoginClient';
import { createAuthHarness } from '../../../data/auth/__testing__/createAuthHarness';
import { LoginViewModel } from '../LoginViewModel';
import { FakeAuthFlowNavigator } from './FakeAuthFlowNavigator';

/** 로그인 ViewModel + Fake 카카오 + AuthRepository(Fake transport/저장소) 한 벌. */
export function createLoginHarness() {
  const auth = createAuthHarness();
  const client = new FakeSocialLoginClient();
  const nonce = new FakeNonceGenerator();
  const navigator = new FakeAuthFlowNavigator();
  const analytics = new FakeAnalyticsTracker();
  const viewModel = new LoginViewModel({
    socialLoginClient: client,
    nonceGenerator: nonce,
    authRepository: auth.repository,
    pushRegistrar: auth.push,
    navigator,
    analytics,
  });
  return { ...auth, client, nonce, navigator, analytics, viewModel };
}

export type LoginHarness = ReturnType<typeof createLoginHarness>;
