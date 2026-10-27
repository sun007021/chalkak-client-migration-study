import { act, screen, waitFor } from '@testing-library/react';
import { createAppRoutes } from './routes';
import { makeHarness, renderApp } from '../test/appHarness';
import { watchAdded } from '../test/domWatch';
import { guestSession, loadFixture, memberSession } from '../test/fixtures';
import { FakeHomePreloader } from '../test/FakeHomePreloader';
import { loadStorageFixture } from '../test/sessionFixtures';
import { d } from '../core/net/decode';
import { EMPTY_SESSION } from '../core/auth/SessionStore';
import { t } from '../copy/ko';

const decodeId = d.object({ id: d.string() });

describe('부팅 흐름 (스플래시 → 인증 게이트)', () => {
  it('TC-BOOT-001 세션이 없으면 스플래시 뒤 로그인 화면이 열리고 홈은 한 번도 그려지지 않는다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__empty').session });
    const home = watchAdded('home.root');
    const { path, router } = renderApp(h.container);
    expect(screen.getByTestId('splash.logo')).toBeInTheDocument();
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE'); // 스플래시/부팅 경로가 뒤로가기에 남지 않는다
    expect(screen.queryByTestId('splash.logo')).not.toBeInTheDocument();
    expect(home.seen()).toBe(false);
    home.stop();
  });

  it('TC-BOOT-002 만료 전 refresh token이 있으면 로그인 화면을 거치지 않고 홈(회원)이 열린다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__authenticated').session });
    const login = watchAdded('login.root');
    const { path } = renderApp(h.container);
    const home = await screen.findByTestId('home.root');
    expect(home).toHaveAttribute('data-mode', 'member');
    expect(path()).toBe('/home');
    expect(login.seen()).toBe(false);
    login.stop();
  });

  it('TC-BOOT-003 게스트 플래그만 있으면 홈이 게스트 제한 모드로 열리고 인증 API 호출이 0건이다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__guest').session });
    renderApp(h.container);
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'guest');
    expect(h.ff.calls).toHaveLength(0);
    expect(h.preloader.calls).toEqual(['guest']);
  });

  it('TC-BOOT-008 인증 세션과 게스트 플래그가 함께 있으면 홈은 회원 모드이다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__authenticated-and-guest').session });
    renderApp(h.container);
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'member');
  });

  it('TC-BOOT-004 refresh token이 만료된 세션은 지우고 로그인 화면을 연다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__expired-refresh').session });
    renderApp(h.container);
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
  });

  it('TC-BOOT-007 저장소를 읽을 수 없어도 크래시 없이 로그인 화면이 열린다', async () => {
    const h = makeHarness();
    vi.spyOn(h.store, 'read').mockRejectedValue(new Error('cannot decrypt'));
    renderApp(h.container);
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
  });

  it('TC-BOOT-015 세션을 읽는 동안에는 스플래시만 보이고 로그인 화면이 번쩍이지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realRead = h.store.read.bind(h.store);
    vi.spyOn(h.store, 'read').mockImplementation(async () => {
      await gate;
      return realRead();
    });
    const login = watchAdded('login.root');
    renderApp(h.container);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('splash.logo')).toBeInTheDocument();
    expect(screen.queryByTestId('login.root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home.root')).not.toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(login.seen()).toBe(false);
    login.stop();
  });

  it('TC-BOOT-011 홈 프리로드가 끝나지 않으면 699ms까지 스플래시를 유지하고 700ms에 홈이 열린다', async () => {
    const h = makeHarness({ session: memberSession() });
    const preloader = new FakeHomePreloader(); // 끝나지 않는다
    const container = { ...h.container, preloader };
    renderApp(container);
    await act(async () => {
      await h.clock.advance(699);
    });
    expect(screen.getByTestId('splash.logo')).toBeInTheDocument();
    expect(screen.queryByTestId('home.root')).not.toBeInTheDocument();
    await act(async () => {
      await h.clock.advance(1);
    });
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(preloader.calls).toEqual(['member']);
  });

  it('TC-BOOT-033 TC-BOOT-032 Web은 강제 업데이트 게이트 UI도 스토어 조회도 없다(어떤 세션에서든)', async () => {
    for (const session of [EMPTY_SESSION, guestSession, memberSession()]) {
      const h = makeHarness({ session });
      const dialog = watchAdded('update-gate.dialog');
      const view = renderApp(h.container);
      await waitFor(() => expect(screen.queryByTestId('splash.logo')).not.toBeInTheDocument());
      expect(dialog.seen()).toBe(false);
      expect(screen.queryByTestId('update-gate.dialog')).not.toBeInTheDocument();
      expect(h.ff.calls).toHaveLength(0); // itunes lookup 같은 조회 없음
      dialog.stop();
      view.unmount();
    }
  });

  it('알 수 없는 경로는 부팅 경로로 되돌려 보낸다', async () => {
    const h = makeHarness();
    const { path } = renderApp(h.container, '/does-not-exist');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
  });
});

describe('보호된 경로와 세션 만료', () => {
  it('세션이 없으면 /home에 직접 들어가도 /login으로 replace 이동한다', async () => {
    const h = makeHarness();
    const home = watchAdded('home.root');
    const { path } = renderApp(h.container, '/home');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(home.seen()).toBe(false);
    home.stop();
  });

  it('TC-AUTH-056 REAUTHENTICATION_REQUIRED를 받으면 세션을 지우고 로그인 화면으로 가며 뒤로 가기로 홈에 돌아오지 못한다', async () => {
    const h = makeHarness({ session: memberSession() });
    const { router, path } = renderApp(h.container, '/home');
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    h.ff.route('GET /notifications', () => loadFixture('auth/refresh__reauthentication-required.json').toResponse());
    await act(async () => {
      await h.container.api.request({ method: 'GET', path: '/notifications' }, decodeId).catch(() => undefined);
    });
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    // 이전 화면(홈)으로 되돌아가려 해도 세션이 없으므로 다시 로그인으로 보낸다
    await act(async () => {
      await router.navigate('/home');
    });
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(screen.queryByTestId('home.root')).not.toBeInTheDocument();
  });

  it('TC-AUTH-056 로그아웃·탈퇴 이벤트도 로그인으로 replace 이동한다', async () => {
    for (const reason of ['logout', 'withdrawn'] as const) {
      const h = makeHarness({ session: memberSession() });
      const { path, router, unmount } = renderApp(h.container, '/home');
      expect(await screen.findByTestId('home.root')).toBeInTheDocument();
      await h.store.clear();
      act(() => h.container.sessionEvents.emit(reason));
      expect(await screen.findByTestId('login.root')).toBeInTheDocument();
      expect(path()).toBe('/login');
      expect(router.state.historyAction).toBe('REPLACE');
      unmount();
    }
  });
});

describe('분석과 토스트', () => {
  it('REQ-BOOT-021 로그인 화면이 보일 때 screen_view(login)을 1회 보낸다(부팅 경로는 보내지 않는다)', async () => {
    const h = makeHarness();
    renderApp(h.container);
    await screen.findByTestId('login.root');
    expect(h.tracker.events).toEqual([{ name: 'screen_view', params: { screen_name: 'login' } }]);
  });

  it('REQ-BOOT-021 홈이 열리면 screen_view(home)이고 login은 보내지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    renderApp(h.container);
    await screen.findByTestId('home.root');
    expect(h.tracker.events).toEqual([{ name: 'screen_view', params: { screen_name: 'home' } }]);
  });

  it('토스트 호스트가 앱 전체에 한 번 마운트되어 container.toast의 메시지를 그린다', async () => {
    const h = makeHarness();
    renderApp(h.container);
    await screen.findByTestId('login.root');
    act(() => h.container.toast.show(t('auth.withdraw.error')));
    expect(screen.getByTestId('toast.message')).toHaveTextContent(t('auth.withdraw.error'));
  });
});

describe('라우트 정의', () => {
  const paths = (container: ReturnType<typeof makeHarness>['container']) => {
    const collect = (routes: ReturnType<typeof createAppRoutes>): string[] =>
      routes.flatMap((r) => [...(r.path ? [r.path] : []), ...(r.children ? collect(r.children) : [])]);
    return collect(createAppRoutes(container));
  };

  it('필수 경로가 있다: /, /login, /login/kakao-callback, /signup/terms, /home', () => {
    expect(paths(makeHarness().container)).toEqual(expect.arrayContaining(['/', '/login', '/login/kakao-callback', '/signup/terms', '/home']));
  });

  it('TC-AUTH-059 개발 플래그가 꺼져 있으면 /dev/session 라우트가 없다', () => {
    expect(paths(makeHarness({ devSession: false }).container)).not.toContain('/dev/session');
  });

  it('TC-AUTH-059 개발 플래그가 켜져 있으면(테스트 환경의 DEV_SESSION_ENABLED는 true) /dev/session 라우트가 있다', () => {
    expect(paths(makeHarness({ devSession: true }).container)).toContain('/dev/session');
  });
});
