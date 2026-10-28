import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { FakeExternalLinkOpener } from '../../../core/linking/__testing__/FakeExternalLinkOpener';
import { FakePushRegistrar } from '../../../core/push/__testing__/FakePushRegistrar';
import { FakePushPermissionGateway } from '../../../core/push/__testing__/FakePushPermissionGateway';
import type { PushPermissionStatus } from '../../../core/push/PushPermissionGateway';
import { UserDataCacheRegistry } from '../../../core/push/UserDataCacheRegistry';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { AuthRepository } from '../../../data/auth/AuthRepository';
import { NotificationSettingsRepository } from '../../../data/settings/NotificationSettingsRepository';
import { SignatureRepository } from '../../../data/signature/SignatureRepository';
import { AccountActionsViewModel } from '../../auth/AccountActionsViewModel';
import type { MainMode } from '../../auth/AuthFlowNavigator';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { SignatureCardViewModel } from '../../signature/SignatureCardViewModel';
import { SettingsViewModel } from '../SettingsViewModel';
import { FakeSettingsNavigator } from './FakeSettingsNavigator';

export const GET_PUSH = 'GET /notification-settings';
export const PATCH_PUSH = 'PATCH /notification-settings';
export const GET_SIGNATURE = 'GET /users/me/signature';
export const APP_VERSION = '1.1.1';

/** 성공 경로 기본 라우트. 테스트가 필요한 키만 router.set으로 바꾼다. */
export const SETTINGS_ROUTES: Record<string, RouteValue> = {
  [GET_PUSH]: 'settings/notification-settings__get-all-true',
  [PATCH_PUSH]: 'settings/notification-settings__patch-no-content',
  [GET_SIGNATURE]: 'signature/users-me-signature__get-success',
  'POST /auth/logout': 'auth/logout__no-content',
  'DELETE /users/me': 'auth/users-me__delete-no-content',
};

export type SettingsHarnessOptions = {
  mode?: MainMode;
  routes?: Record<string, RouteValue>;
  permission?: PushPermissionStatus;
};

/** 설정 탭 한 벌: 실제 ViewModel·리포지토리·AccountActions + Fake transport·저장소·권한·분석·토스트·링크·내비게이터. */
export async function createSettingsHarness(options: SettingsHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const net = createNetHarness();
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter({ ...SETTINGS_ROUTES, ...options.routes }).install(
    net.transport,
  );

  const registry = new UserDataCacheRegistry();
  const push = new FakePushRegistrar();
  const authRepository = new AuthRepository({
    api: net.api,
    sessionStore: net.sessionStore,
    clock: net.clock,
    caches: [registry],
    pushRegistrar: push,
  });
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const navigator = new FakeSettingsNavigator();
  const permission = new FakePushPermissionGateway(options.permission ?? 'granted');
  const linkOpener = new FakeExternalLinkOpener();

  const account = new AccountActionsViewModel({ authRepository, navigator: authFlow, toast });
  const signatureCard = new SignatureCardViewModel({
    repository: new SignatureRepository({ api: net.api }),
    toast,
    navigator,
    authFlow,
  });
  const viewModel = new SettingsViewModel({
    mode,
    settings: new NotificationSettingsRepository({ api: net.api }),
    signatureCard,
    account,
    permission,
    appVersion: { getVersion: () => APP_VERSION },
    analytics,
    linkOpener,
    toast,
    navigator,
    authFlow,
  });
  registry.register(viewModel);

  const callsOf = (key: string) => router.calls(key).length;
  const patchBodies = () => router.calls(PATCH_PUSH).map((r) => JSON.parse(String(r.body)));
  return {
    ...net,
    router,
    registry,
    authRepository,
    analytics,
    toast,
    authFlow,
    navigator,
    permission,
    linkOpener,
    account,
    signatureCard,
    viewModel,
    callsOf,
    patchBodies,
  };
}

export type SettingsHarness = Awaited<ReturnType<typeof createSettingsHarness>>;
