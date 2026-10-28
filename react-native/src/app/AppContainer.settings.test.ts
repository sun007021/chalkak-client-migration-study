import type { AnalyticsBackend } from '../core/analytics/AnalyticsBackend';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { deferred } from '../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../core/http/__testing__/loadFixture';
import { FakeNotificationPermission } from '../core/push/__testing__/FakeNotificationPermission';
import { FakeToastPresenter } from '../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { FakeFeedbackNavigator } from '../features/feedback/__testing__/FakeFeedbackNavigator';
import { SETTINGS_ROUTES } from '../features/settings/__testing__/createSettingsHarness';
import { SettingsViewModel } from '../features/settings/SettingsViewModel';
import { t } from '../shared/copy';
import { AppContainer } from './AppContainer';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

async function create(mode: 'member' | 'guest' = 'member') {
  const net = createNetHarness();
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter(SETTINGS_ROUTES).install(net.transport);
  const toast = new FakeToastPresenter();
  const permission = new FakeNotificationPermission('granted');
  const backendEvents: { name: string; params: unknown }[] = [];
  const analyticsBackend: AnalyticsBackend = {
    logEvent: (name, params) => backendEvents.push({ name, params }),
  };
  const container = AppContainer.create(
    { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    {
      clock: net.clock,
      sessionStore: net.sessionStore,
      events: net.events,
      api: net.api,
      toast,
      notificationPermission: permission,
      appInfo: { platform: 'ios', bundleId: 'b', version: '3.4.5', appStoreId: null },
      analyticsBackend,
    },
  );
  return { net, router, toast, permission, container, backendEvents };
}

describe('AppContainer 설정·피드백·분석 조립 (PR11)', () => {
  it('TC-SET-049 메인 단계에 들어가면 설정 소유자가 앱 설정의 버전 문자열을 가진 ViewModel을 만든다', async () => {
    const { container } = await create();
    expect(container.settingsOwner.getSnapshot().viewModel).toBeNull();
    await container.bootViewModel.start();
    const viewModel = container.settingsOwner.getSnapshot().viewModel;
    expect(viewModel).toBeInstanceOf(SettingsViewModel);
    expect(viewModel?.getSnapshot()).toMatchObject({ mode: 'member', version: '3.4.5' });
  });

  it('TC-SET-008 게스트 메인에서는 게스트 모드 ViewModel이고 설정 API를 부르지 않는다', async () => {
    const { container, net } = await create('guest');
    await container.bootViewModel.start();
    const viewModel = container.settingsOwner.getSnapshot().viewModel!;
    await viewModel.onShown();
    expect(viewModel.getSnapshot().mode).toBe('guest');
    expect(
      net.transport.requests.filter((r) =>
        /notification-settings|users\/me\/signature/.test(r.url),
      ),
    ).toHaveLength(0);
  });

  it('TC-SET-037 로그아웃(캐시 레지스트리 clearAll)이 설정 ViewModel의 이전 계정 값을 비우고 소유자가 ViewModel을 버린다', async () => {
    const { container } = await create();
    await container.bootViewModel.start();
    const viewModel = container.settingsOwner.getSnapshot().viewModel!;
    await viewModel.onShown();
    expect(viewModel.getSnapshot().push.values).not.toBeNull();
    await container.authRepository.logout();
    expect(viewModel.getSnapshot().push.values).toBeNull();
    container.bootViewModel.toLogin();
    expect(container.settingsOwner.getSnapshot().viewModel).toBeNull();
  });

  it('TC-ANL-001 TC-ANL-020 분석 백엔드를 주입하면 컨테이너의 tracker가 그쪽으로 보내고, 주입하지 않으면 로그 출력 구현이다', async () => {
    const { container, backendEvents } = await create();
    container.analytics.screenView('settings');
    expect(backendEvents).toEqual([{ name: 'screen_view', params: { screen_name: 'settings' } }]);

    const net = createNetHarness();
    const plain = AppContainer.create(
      { apiBaseUrl: 'http://localhost:4010/api/v1/' },
      { clock: net.clock, sessionStore: net.sessionStore, events: net.events, api: net.api },
    );
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(() => plain.analytics.screenView('settings')).not.toThrow();
    info.mockRestore();
  });

  it('TC-FDBK-001 createFeedbackViewModel이 만든 ViewModel로 전송하면 성공 토스트와 닫기가 동작한다', async () => {
    const { container, toast, router } = await create();
    const navigator = new FakeFeedbackNavigator();
    const viewModel = container.createFeedbackViewModel(navigator);
    viewModel.onTextChange('좋아요');
    router.set('POST /feedbacks', 'feedback/feedbacks__created');
    await viewModel.submit();
    expect(toast.messages).toEqual([t('fdbk.success')]);
    expect(navigator.closes).toBe(1);
  });

  it('TC-FDBK-030 전송 중 로그아웃하면 늦은 응답이 토스트도 화면 닫기도 일으키지 않는다(캐시 레지스트리에 올라 있다)', async () => {
    const { container, toast, router } = await create();
    const navigator = new FakeFeedbackNavigator();
    const viewModel = container.createFeedbackViewModel(navigator);
    const gate = deferred<void>();
    router.set('POST /feedbacks', async () => {
      await gate.promise;
      return fixtureResponse('feedback/feedbacks__created');
    });
    viewModel.onTextChange('좋아요');
    const sending = viewModel.submit();
    await flush();
    await container.authRepository.logout();
    gate.resolve();
    await sending;
    await flush();
    expect(toast.messages).toEqual([]);
    expect(navigator.closes).toBe(0);
  });

  it('TC-FDBK-020 dispose한 피드백 ViewModel은 캐시 레지스트리에서 빠져 이후 로그아웃에 영향받지 않는다', async () => {
    const { container } = await create();
    const viewModel = container.createFeedbackViewModel(new FakeFeedbackNavigator());
    viewModel.onTextChange('남아 있으면 안 되는 내용');
    viewModel.dispose();
    const clearAll = jest.spyOn(viewModel, 'clearAll');
    await container.authRepository.logout();
    expect(clearAll).not.toHaveBeenCalled();
  });
});
