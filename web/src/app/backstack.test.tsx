import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../test/appHarness';
import type { Harness } from '../test/appHarness';
import { watchAdded } from '../test/domWatch';
import { loadFixture, memberSession } from '../test/fixtures';
import { EMPTY_SESSION } from '../core/auth/SessionStore';

const TAB_IDS = {
  home: 'bottom-bar.tab-home',
  display: 'bottom-bar.tab-display',
  record: 'bottom-bar.tab-record',
  settings: 'bottom-bar.tab-settings',
} as const;
const tabButton = (tab: keyof typeof TAB_IDS) => screen.getByTestId(TAB_IDS[tab]);

async function memberAt(tab: 'display' | 'record' | 'settings') {
  const h = makeHarness({ session: memberSession() });
  const view = renderApp(h.container, '/home');
  await screen.findByTestId('bottom-bar.root');
  fireEvent.click(tabButton(tab));
  await screen.findByTestId(`${tab}.root`);
  return { h, ...view };
}

const routeLogout = (h: Harness) => h.ff.route('POST /auth/logout', () => loadFixture('auth/logout__no-content.json').toResponse());

describe('로그인·로그아웃·재인증과 백스택 (RequireSession 연계)', () => {
  it('TC-NAV-039 REQ-NAV-021 로그인 성공 뒤 홈은 replace로 열려 뒤로 가도 로그인 화면으로 돌아오지 않는다', async () => {
    const h = makeHarness();
    h.ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__login-success.json').toResponse());
    const { path, router } = renderApp(h.container, '/login');
    fireEvent.click(await screen.findByTestId('login.kakao-button'));
    await screen.findByTestId('bottom-bar.root');
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    const login = watchAdded('login.root');
    await act(async () => router.navigate(-1));
    expect(path()).toBe('/home');
    expect(login.seen()).toBe(false);
    login.stop();
  });

  it('TC-NAV-041 REQ-NAV-022 로그아웃하면 로그인으로 replace 이동하고, 뒤로 가도 보호 화면(메인)이 다시 열리지 않는다', async () => {
    const { h, path, router } = await memberAt('display'); // 히스토리: [홈, 전시]
    routeLogout(h);
    await act(async () => h.container.accountService.logout());
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeInTheDocument();

    const main = watchAdded('bottom-bar.root');
    const home = watchAdded('home.root');
    await act(async () => router.navigate(-1)); // 아래에는 보호된 홈이 있다
    await waitFor(() => expect(path()).toBe('/login'));
    await screen.findByTestId('login.root');
    expect(main.seen()).toBe(false);
    expect(home.seen()).toBe(false);
    main.stop();
    home.stop();
  });

  it('TC-NAV-041 로그아웃 뒤 브라우저 앞으로도 보호 화면이 열리지 않는다', async () => {
    const { h, path, router } = await memberAt('record');
    routeLogout(h);
    await act(async () => h.container.accountService.logout());
    await screen.findByTestId('login.root');
    await act(async () => router.navigate(-1));
    await act(async () => router.navigate(1));
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(screen.queryByTestId('record.root')).not.toBeInTheDocument();
  });

  it('TC-NAV-042 REQ-NAV-022 어느 탭에서든 세션이 만료되면(REAUTHENTICATION_REQUIRED) 로그인으로 replace 이동하고 보호 화면으로 돌아가지 못한다', async () => {
    const { h, path, router } = await memberAt('settings');
    await act(async () => {
      await h.store.clear(); // AuthCoordinator가 세션을 지운 뒤
      h.container.sessionEvents.emit('expired');
    });
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
    const main = watchAdded('bottom-bar.root');
    await act(async () => router.navigate(-1));
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(main.seen()).toBe(false);
    main.stop();
  });

  it('TC-NAV-044 세션이 없는 채로 보호된 탭 URL(/display, /record, /settings)에 들어오면 로그인으로 간다', async () => {
    for (const url of ['/display', '/record', '/settings', '/home']) {
      const h = makeHarness({ session: EMPTY_SESSION });
      const main = watchAdded('bottom-bar.root');
      const { path, unmount } = renderApp(h.container, url);
      await screen.findByTestId('login.root');
      expect(path(), url).toBe('/login');
      expect(main.seen(), url).toBe(false);
      main.stop();
      unmount();
    }
  });

  it('TC-NAV-050 계정 A에서 로그아웃하고 계정 B로 로그인하면 홈 탭이 선택되고 A의 사용자 캐시는 비워져 있다', async () => {
    const { h, path } = await memberAt('record');
    const cleared = vi.fn();
    h.container.userCaches.register({ clear: cleared }); // 예: 기록 탭의 선택 월, 전시의 정렬 상태 캐시
    routeLogout(h);
    h.ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__login-success.json').toResponse());
    await act(async () => h.container.accountService.logout());
    expect(cleared).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByTestId('login.kakao-button'));
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(tabButton('home')).toHaveAttribute('aria-selected', 'true');
    expect(tabButton('record')).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByTestId('record.root')).not.toBeInTheDocument();
  });

  it('TC-NAV-050 재로그인 뒤 탭 사이를 오가는 기록은 새 세션 기준으로 시작한다: 새 홈에서 전시로 가면 push이다', async () => {
    const { h, router } = await memberAt('settings');
    routeLogout(h);
    h.ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__login-success.json').toResponse());
    await act(async () => h.container.accountService.logout());
    fireEvent.click(await screen.findByTestId('login.kakao-button'));
    await screen.findByTestId('home.root');
    fireEvent.click(tabButton('display'));
    await screen.findByTestId('display.root');
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.state).toEqual({ homeBelow: true });
  });
});
