import { fireEvent, render, screen } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FakeSecureKeyValueStorage } from '../core/session/__testing__/FakeSecureKeyValueStorage';
import { SecureSessionStore } from '../core/session/SecureSessionStore';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { GUEST_ROUTES, MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

/** 가짜 서버(홈 fixture)에 붙은 앱. 회원이면 로그인된 세션, 게스트면 게스트 플래그로 시작한다. */
async function renderApp(mode: 'member' | 'guest') {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();
  new FixtureRouter(mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES).install(net.transport);
  const analytics = new FakeAnalyticsTracker();
  await render(
    <App
      configResult={OK}
      overrides={{
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        analytics,
      }}
    />,
  );
  return { net, analytics };
}

describe('App', () => {
  it('로그인된 세션이면 스플래시 뒤에 하단 바와 홈 탭이 보이고 홈이 선택되어 있다', async () => {
    await renderApp('member');
    expect(await screen.findByTestId('bottom-bar.root')).toBeOnTheScreen();
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    for (const id of ['display', 'record', 'settings']) {
      expect(screen.getByTestId(`bottom-bar.tab-${id}`)).not.toBeSelected();
    }
    expect(screen.getByTestId('bottom-bar.upload-button')).toBeOnTheScreen();
    expect(await screen.findByTestId('home.hero-photo')).toBeOnTheScreen();
  });

  it('REQ-NAV-009 탭을 누르면 해당 탭으로 바뀌고 bottom_navigation_selected를 보낸다(재선택 포함)', async () => {
    const { analytics } = await renderApp('member');
    await screen.findByTestId('home.hero-photo');
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-display'));
    expect(screen.getByTestId('bottom-bar.tab-display')).toBeSelected();
    expect(screen.getByTestId('bottom-bar.tab-home')).not.toBeSelected();
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-display'));
    expect(analytics.events.filter((e) => e.name === 'bottom_navigation_selected')).toEqual([
      { name: 'bottom_navigation_selected', params: { destination: 'display' } },
      { name: 'bottom_navigation_selected', params: { destination: 'display' } },
    ]);
  });

  it('REQ-NAV-004 홈 탭을 떠났다 돌아오면 홈 화면이 새로 보인다(onHidden -> onShown)', async () => {
    await renderApp('member');
    await screen.findByTestId('home.hero-photo');
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
    expect(screen.queryByTestId('home.root')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-home'));
    expect(await screen.findByTestId('home.hero-photo')).toBeOnTheScreen();
  });

  it('REQ-NAV-013 게스트가 기록 탭을 누르면 탭이 바뀌지 않고 토스트가 뜬다', async () => {
    await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    await fireEvent.press(screen.getByTestId('bottom-bar.tab-record'));
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      '기록을 보려면 로그인이 필요해요',
    );
  });

  it('D-05 게스트가 업로드 버튼을 누르면 토스트만 뜬다', async () => {
    await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    await fireEvent.press(screen.getByTestId('bottom-bar.upload-button'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      '게시물을 추가하려면 로그인이 필요해요',
    );
  });

  it('TC-BANR-012 홈의 배너 카드를 누르면 ISSUE 웹뷰 화면이 열린다', async () => {
    await renderApp('member');
    const card = await screen.findByTestId('home.issue-item-44444444-4444-4444-8444-444444444401');
    await fireEvent.press(card);
    expect(await screen.findByTestId('issue.root')).toBeOnTheScreen();
    expect(screen.getByTestId('issue.title')).toHaveTextContent('ISSUE');
  });

  it('세션이 없으면 로그인 화면이 열린다', async () => {
    const sessionStore = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await render(<App configResult={OK} overrides={{ sessionStore }} />);
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeOnTheScreen();
  });

  it('TC-NET-050 설정 오류면 common.error.config 화면만 보이고 내비게이터는 뜨지 않는다', async () => {
    await render(<App configResult={{ ok: false, error: 'config' }} />);
    expect(screen.getByTestId('config-error.error-state')).toHaveTextContent(
      'API 설정을 확인해 주세요.',
    );
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeOnTheScreen();
  });
});
