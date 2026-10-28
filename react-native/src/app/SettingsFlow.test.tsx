import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FakePushPermissionGateway } from '../core/push/__testing__/FakePushPermissionGateway';
import { FixtureRouter, type RouteValue } from '../data/__testing__/FixtureRouter';
import { GUEST_ROUTES, MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { SETTINGS_ROUTES } from '../features/settings/__testing__/createSettingsHarness';
import { t } from '../shared/copy';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

async function renderApp(mode: 'member' | 'guest', extra: Record<string, RouteValue> = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter(
    mode === 'member'
      ? { ...MEMBER_ROUTES, ...SETTINGS_ROUTES, ...extra }
      : { ...GUEST_ROUTES, ...extra },
  ).install(net.transport);
  const analytics = new FakeAnalyticsTracker();
  const permission = new FakePushPermissionGateway('granted');
  await render(
    <App
      configResult={OK}
      overrides={{
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        analytics,
        push: { permission },
        appInfo: { platform: 'ios', bundleId: 'b', version: '1.1.1', appStoreId: null },
      }}
    />,
  );
  return { net, router, analytics, permission };
}

async function openSettingsTab() {
  await screen.findByTestId('bottom-bar.root');
  await fireEvent.press(screen.getByTestId('bottom-bar.tab-settings'));
  return screen.findByTestId('settings.root');
}

describe('설정 탭 연결', () => {
  it('TC-SET-001 TC-SET-049 TC-SET-052 설정 탭을 누르면 설정 화면이 보이고 버전이 표시되며 screen_view settings를 1회 보낸다', async () => {
    const { analytics, router } = await renderApp('member');
    await openSettingsTab();
    expect(screen.getByTestId('bottom-bar.tab-settings')).toBeSelected();
    expect(await screen.findByTestId('settings.push-topic-toggle')).toBeEnabled();
    expect(screen.getByTestId('settings.version-value')).toHaveTextContent('1.1.1');
    expect(analytics.screenNames.filter((name) => name === 'settings')).toEqual(['settings']);
    expect(router.calls('GET /notification-settings')).toHaveLength(1);
    expect(router.calls('GET /users/me/signature')).toHaveLength(1);
  });

  it('TC-SET-008 TC-ANL-022 게스트의 설정 탭은 "로그인" 버튼만 보이고 설정 API 요청이 없다', async () => {
    const { net, analytics } = await renderApp('guest');
    await openSettingsTab();
    expect(screen.getByTestId('settings.login-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings.logout-row')).not.toBeOnTheScreen();
    expect(
      net.transport.requests.filter((r) => /notification-settings|users\/me/.test(r.url)),
    ).toHaveLength(0);
    expect(analytics.screenNames).toContain('settings');
  });

  it('TC-SET-050 TC-FDBK-001 TC-FDBK-017 "피드백 보내기"로 피드백 화면을 열고(screen_view feedback 1회) 전송하면 토스트 뒤 설정으로 돌아온다', async () => {
    const { analytics, router } = await renderApp('member', {
      'POST /feedbacks': 'feedback/feedbacks__created',
    });
    await openSettingsTab();
    await fireEvent.press(await screen.findByTestId('settings.feedback-row'));
    expect(await screen.findByTestId('feedback.root')).toBeOnTheScreen();
    expect(analytics.screenNames.filter((name) => name === 'feedback')).toEqual(['feedback']);

    await fireEvent.changeText(screen.getByTestId('feedback.input'), '  좋은 앱이에요  ');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('fdbk.success'));
    await waitFor(() => expect(screen.queryByTestId('feedback.root')).not.toBeOnTheScreen());
    expect(screen.getByTestId('settings.root')).toBeOnTheScreen();
    expect(JSON.parse(String(router.calls('POST /feedbacks')[0].body))).toEqual({
      content: '좋은 앱이에요',
    });
  });

  it('TC-FDBK-020 성공 뒤 피드백 화면을 다시 열면 이전 내용이 남아 있지 않다', async () => {
    await renderApp('member', { 'POST /feedbacks': 'feedback/feedbacks__created' });
    await openSettingsTab();
    await fireEvent.press(await screen.findByTestId('settings.feedback-row'));
    await fireEvent.changeText(await screen.findByTestId('feedback.input'), '내용');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await waitFor(() => expect(screen.queryByTestId('feedback.root')).not.toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('settings.feedback-row'));
    expect((await screen.findByTestId('feedback.input')).props.value).toBe('');
  });

  it('TC-SET-043 로그아웃 확인 뒤 로그인 화면이 열린다', async () => {
    await renderApp('member');
    await openSettingsTab();
    await fireEvent.press(await screen.findByTestId('settings.logout-row'));
    await fireEvent.press(screen.getByTestId('settings.logout-confirm-button'));
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
  });

  it('TC-SET-046 회원탈퇴가 성공하면 로그인 화면이 열린다', async () => {
    await renderApp('member');
    await openSettingsTab();
    await fireEvent.press(await screen.findByTestId('settings.withdraw-row'));
    await fireEvent.press(screen.getByTestId('settings.withdraw-confirm-button'));
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
  });

  it('REQ-SET-004 "변경하기"는 기존 사인 변경 흐름(그리기 화면)을 연다', async () => {
    await renderApp('member');
    await openSettingsTab();
    await fireEvent.press(await screen.findByTestId('settings.signature-change-button'));
    expect(await screen.findByTestId('signature.root')).toBeOnTheScreen();
  });
});
