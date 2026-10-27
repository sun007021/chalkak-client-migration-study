import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { watchAdded } from '../../test/domWatch';
import { guestSession, memberSession } from '../../test/fixtures';
import { t } from '../../copy/ko';
import type { TabDestination } from '../../constants';

const TABS: readonly TabDestination[] = ['home', 'display', 'record', 'settings'];
const TAB_IDS = {
  home: 'bottom-bar.tab-home',
  display: 'bottom-bar.tab-display',
  record: 'bottom-bar.tab-record',
  settings: 'bottom-bar.tab-settings',
} as const;
const tabButton = (tab: TabDestination) => screen.getByTestId(TAB_IDS[tab]);
const selectedTab = () => TABS.filter((tab) => tabButton(tab).getAttribute('aria-selected') === 'true');
const toastText = () => screen.queryByTestId('toast.message')?.textContent ?? null;
const screenViews = (h: Harness) => h.tracker.events.flatMap((e) => (e.name === 'screen_view' ? [e.params.screen_name] : []));
const tabEvents = (h: Harness) => h.tracker.events.flatMap((e) => (e.name === 'bottom_navigation_selected' ? [e.params.destination] : []));

async function openMain(mode: 'member' | 'guest', path = '/home') {
  const h = makeHarness({ session: mode === 'member' ? memberSession() : guestSession });
  const view = renderApp(h.container, path);
  await screen.findByTestId('bottom-bar.root');
  return { h, ...view };
}

async function goTo(tab: TabDestination, path: () => string) {
  fireEvent.click(tabButton(tab));
  await screen.findByTestId(`${tab}.root`);
  expect(path()).toBe(`/${tab}`);
}

describe('하단 바 구성', () => {
  it('TC-NAV-001 REQ-NAV-001 홈, 전시, 업로드 버튼, 기록, 설정 순서로 5개이고 탭 라벨은 홈/전시/기록/설정이다', async () => {
    await openMain('member');
    const bar = screen.getByTestId('bottom-bar.root');
    const ids = Array.from(bar.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['bottom-bar.tab-home', 'bottom-bar.tab-display', 'bottom-bar.upload-button', 'bottom-bar.tab-record', 'bottom-bar.tab-settings']);
    expect(tabButton('home')).toHaveTextContent(t('nav.tab.home'));
    expect(tabButton('display')).toHaveTextContent('전시');
    expect(tabButton('record')).toHaveTextContent('기록');
    expect(tabButton('settings')).toHaveTextContent(t('nav.tab.settings'));
  });

  it('TC-NAV-001 업로드 버튼의 접근성 이름은 "추가"이고 탭 라벨 텍스트는 없다', async () => {
    await openMain('member');
    const upload = screen.getByTestId('bottom-bar.upload-button');
    expect(upload).toHaveAccessibleName(t('nav.tab.upload.a11y'));
    expect(upload).toHaveAccessibleName('추가');
  });

  it('TC-NAV-002 REQ-NAV-002 선택 표시는 탭 네 개 중 하나뿐이고 업로드 버튼은 선택 상태(aria-selected)가 없다', async () => {
    const { path } = await openMain('member');
    expect(selectedTab()).toEqual(['home']);
    const upload = screen.getByTestId('bottom-bar.upload-button');
    expect(upload).not.toHaveAttribute('aria-selected');
    await goTo('display', path);
    expect(selectedTab()).toEqual(['display']);
    fireEvent.click(upload);
    expect(selectedTab()).toEqual(['display']);
    expect(upload).not.toHaveAttribute('aria-selected');
  });

  it('TC-NAV-003 REQ-NAV-003 메인에 처음 들어오면 홈 탭이 선택되어 있다(부팅 경유 포함)', async () => {
    const h = makeHarness({ session: memberSession() });
    const { path } = renderApp(h.container, '/');
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(path()).toBe('/home');
    expect(selectedTab()).toEqual(['home']);
  });

  it('REQ-NAV-023 로그인 화면에는 하단 바가 없다', async () => {
    const h = makeHarness();
    const bar = watchAdded('bottom-bar.root');
    renderApp(h.container, '/');
    await screen.findByTestId('login.root');
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeInTheDocument();
    expect(bar.seen()).toBe(false);
    bar.stop();
  });

  it('TC-NAV-004 홈에서 전시, 기록, 설정 탭을 차례로 누르면 각 화면이 열리고 선택 표시가 따라온다', async () => {
    const { path } = await openMain('member');
    await goTo('display', path);
    expect(selectedTab()).toEqual(['display']);
    await goTo('record', path);
    expect(selectedTab()).toEqual(['record']);
    await goTo('settings', path);
    expect(selectedTab()).toEqual(['settings']);
    expect(screen.queryByTestId('record.root')).not.toBeInTheDocument();
  });

  it('TC-NAV-004 하단 바는 탭을 옮겨도 사라졌다 다시 그려지지 않는다(같은 요소 유지)', async () => {
    const { path } = await openMain('member');
    const bar = screen.getByTestId('bottom-bar.root');
    await goTo('display', path);
    await goTo('settings', path);
    expect(screen.getByTestId('bottom-bar.root')).toBe(bar);
  });

  it('TC-NAV-008 TC-NAV-009 REQ-NAV-008 같은 탭을 다시 누르면 화면이 그대로이고 같은 탭 루트가 하나 더 쌓이지 않는다(REQ-NAV-006)', async () => {
    const { path, router } = await openMain('member');
    await goTo('display', path);
    const root = screen.getByTestId('display.root');
    fireEvent.click(tabButton('display'));
    fireEvent.click(tabButton('display'));
    expect(screen.getByTestId('display.root')).toBe(root);
    expect(path()).toBe('/display');
    await act(async () => router.navigate(-1));
    expect(path()).toBe('/home'); // 재선택이 push였다면 /display에 머문다
  });
});

describe('새로고침 복원과 URL', () => {
  it.each(['display', 'record', 'settings'] as const)('TC-NAV-044 /%s로 직접 들어오면(새로고침) 그 탭이 열리고 선택되어 있다', async (tab) => {
    const { path } = await openMain('member', `/${tab}`);
    expect(await screen.findByTestId(`${tab}.root`)).toBeInTheDocument();
    expect(path()).toBe(`/${tab}`);
    expect(selectedTab()).toEqual([tab]);
    expect(screen.queryByTestId('home.root')).not.toBeInTheDocument();
  });

  it('TC-NAV-044 TC-ANL-005 새로고침으로 복원된 탭은 screen_view를 한 번 보낸다', async () => {
    const h = makeHarness({ session: memberSession() });
    renderApp(h.container, '/record');
    await screen.findByTestId('record.root');
    expect(screenViews(h)).toEqual(['record']);
  });

  it('REQ-NAV-023 탭 루트에서는 네 탭 모두 하단 바와 업로드 버튼이 보인다', async () => {
    const { path } = await openMain('member');
    for (const tab of TABS) {
      if (tab !== 'home') await goTo(tab, path);
      expect(screen.getByTestId('bottom-bar.root')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-bar.upload-button')).toBeInTheDocument();
    }
  });

  it('REQ-NAV-012 게스트도 홈과 전시 탭을 볼 수 있고 인증 API 호출은 0건이다', async () => {
    const { h, path } = await openMain('guest');
    expect(screen.getByTestId('home.root')).toHaveAttribute('data-mode', 'guest');
    await goTo('display', path);
    expect(screen.getByTestId('display.root')).toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-NAV-016 게스트가 /record URL로 직접 들어와도 기록 화면은 열리지 않는다: 홈으로 replace + 토스트 nav.guest.record + 요청 0건 [임시안]', async () => {
    const h = makeHarness({ session: guestSession });
    const record = watchAdded('record.root');
    const { path, router } = renderApp(h.container, '/record');
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(record.seen()).toBe(false);
    expect(toastText()).toBe(t('nav.guest.record'));
    expect(h.ff.calls).toHaveLength(0);
    record.stop();
  });

  it('TC-NAV-024 정지 회원도 셸에서는 회원과 같아 기록·전시·설정·홈이 모두 열린다(제한은 쓰기 403 지점)', async () => {
    const { path } = await openMain('member');
    for (const tab of ['record', 'display', 'settings'] as const) await goTo(tab, path);
    expect(toastText()).toBeNull();
  });

  it('TC-NAV-045 앱이 정의하지 않은 경로·딥링크형 URL은 어떤 화면도 열지 않고 부팅 판정대로 홈이 열린다', async () => {
    for (const url of ['/feed/11111111-1111-4111-8111-111111111111', '/notifications', '/home/extra', '/chalkak:/open']) {
      const h = makeHarness({ session: memberSession() });
      const { path, unmount } = renderApp(h.container, url);
      await screen.findByTestId('home.root');
      expect(path(), url).toBe('/home');
      expect(h.ff.calls, url).toHaveLength(0);
      unmount();
    }
  });

  it('TC-NAV-045 /home에 붙은 쿼리(?postId= 등)는 무시하고 이동하지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    const { router } = renderApp(h.container, '/home?postId=11111111-1111-4111-8111-111111111111');
    await screen.findByTestId('home.root');
    expect(router.state.location.pathname).toBe('/home');
    expect(h.ff.calls).toHaveLength(0);
  });
});

describe('탭 전환과 브라우저 히스토리', () => {
  it('TC-NAV-044 홈에서 다른 탭은 push, 비홈 탭끼리는 replace이다', async () => {
    const { path, router } = await openMain('member');
    fireEvent.click(tabButton('display'));
    await screen.findByTestId('display.root');
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.state).toEqual({ homeBelow: true });
    fireEvent.click(tabButton('settings'));
    await screen.findByTestId('settings.root');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(path()).toBe('/settings');
  });

  it('TC-NAV-044 REQ-NAV-026 비홈 탭 루트에서 브라우저 뒤로 가면 홈이다(전시 → 설정 → 뒤로)', async () => {
    const { path, router } = await openMain('member');
    await goTo('display', path);
    await goTo('settings', path);
    await act(async () => router.navigate(-1));
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(selectedTab()).toEqual(['home']);
  });

  it('TC-NAV-044 뒤로 간 홈에서 브라우저 앞으로를 누르면 직전 탭이 다시 열리고 선택 표시가 따라온다', async () => {
    const { path, router } = await openMain('member');
    await goTo('record', path);
    await act(async () => router.navigate(-1));
    await screen.findByTestId('home.root');
    await act(async () => router.navigate(1));
    await screen.findByTestId('record.root');
    expect(selectedTab()).toEqual(['record']);
  });

  it('TC-NAV-044 REQ-NAV-026 비홈 탭에서 홈 탭을 누르면 홈이 두 번 쌓이지 않고 뒤로 간다(POP)', async () => {
    const { path, router } = await openMain('member');
    await goTo('display', path);
    await goTo('settings', path);
    fireEvent.click(tabButton('home'));
    await screen.findByTestId('home.root');
    expect(router.state.historyAction).toBe('POP');
    expect(selectedTab()).toEqual(['home']);
    await act(async () => router.navigate(-1)); // 홈 아래에는 앱 화면이 없다
    expect(path()).toBe('/home');
  });

  it('TC-NAV-044 /settings로 직접 들어온(아래에 홈이 없는) 경우 홈 탭은 replace로 간다', async () => {
    const { path, router } = await openMain('member', '/settings');
    fireEvent.click(tabButton('home'));
    await screen.findByTestId('home.root');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(path()).toBe('/home');
  });

  it('TC-NAV-004 TC-NAV-044 뒤로가기로 탭이 바뀌어도 하단 바 선택 표시는 URL을 따른다', async () => {
    const { path, router } = await openMain('member');
    await goTo('display', path);
    expect(selectedTab()).toEqual(['display']);
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(selectedTab()).toEqual(['home']));
  });
});

describe('게스트 제한 (D-05)', () => {
  it('TC-NAV-016 REQ-NAV-013 게스트가 기록 탭을 누르면 탭이 바뀌지 않고 토스트가 뜨며 요청은 0건이다', async () => {
    const { h, path, router } = await openMain('guest');
    const before = router.state.location.key;
    fireEvent.click(tabButton('record'));
    expect(toastText()).toBe('기록을 보려면 로그인이 필요해요');
    expect(toastText()).toBe(t('nav.guest.record'));
    expect(path()).toBe('/home');
    expect(router.state.location.key).toBe(before);
    expect(selectedTab()).toEqual(['home']);
    expect(screen.queryByTestId('record.root')).not.toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-NAV-016 전시 탭에서 기록 탭을 눌러도 전시에 머문다', async () => {
    const { path } = await openMain('guest');
    await goTo('display', path);
    fireEvent.click(tabButton('record'));
    expect(toastText()).toBe(t('nav.guest.record'));
    expect(selectedTab()).toEqual(['display']);
    expect(screen.getByTestId('display.root')).toBeInTheDocument();
  });

  it('TC-NAV-016 TC-NAV-026 막힌 기록 탭을 다시 눌러도 토스트가 새로 뜬다', async () => {
    const { h } = await openMain('guest');
    fireEvent.click(tabButton('record'));
    const first = screen.getByTestId('toast.container');
    await act(async () => h.clock.advance(1_000));
    fireEvent.click(tabButton('record'));
    expect(screen.getByTestId('toast.container')).not.toBe(first);
    await act(async () => h.clock.advance(2_499));
    expect(toastText()).toBe(t('nav.guest.record'));
    await act(async () => h.clock.advance(1));
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
  });

  it('TC-NAV-017 REQ-NAV-014 게스트가 업로드 버튼을 누르면 토스트만 뜨고 업로드 진입·GET /posts/today는 0건이다', async () => {
    const { h } = await openMain('guest');
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(toastText()).toBe('게시물을 추가하려면 로그인이 필요해요');
    expect(toastText()).toBe(t('nav.guest.upload'));
    expect(h.upload.starts).toBe(0);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(0);
    expect(h.ff.calls).toHaveLength(0);
    expect(selectedTab()).toEqual(['home']);
  });

  it('TC-NAV-005 회원이 업로드 버튼을 누르면 업로드 진입을 시작하고 선택 탭·경로·토스트는 그대로이다', async () => {
    const { h, path } = await openMain('member');
    await goTo('settings', path);
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(h.upload.starts).toBe(1);
    expect(selectedTab()).toEqual(['settings']);
    expect(path()).toBe('/settings');
    expect(toastText()).toBeNull();
  });

  it('TC-NAV-005 TC-NAV-017 업로드 진입 시작은 셸이 직접 API를 부르지 않는다(게이트 요청은 UPL 몫)', async () => {
    const { h } = await openMain('member');
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(h.ff.calls).toHaveLength(0);
  });

  it('REQ-NAV-044 TC-NAV-025 게스트 제한 토스트는 2.5초 동안 보였다가 사라진다', async () => {
    const { h } = await openMain('guest');
    fireEvent.click(tabButton('record'));
    await act(async () => h.clock.advance(2_499));
    expect(screen.getByTestId('toast.container')).toBeInTheDocument();
    await act(async () => h.clock.advance(1));
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
  });

  it('TC-NAV-028 문서가 숨겨진 동안의 게스트 제한 토스트는 표시하지 않고, 다시 보여도 쌓여 있지 않다', async () => {
    const { h } = await openMain('guest');
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    fireEvent.click(tabButton('record'));
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
    state.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.queryByTestId('toast.container')).not.toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
    fireEvent.click(tabButton('record'));
    expect(toastText()).toBe(t('nav.guest.record'));
    state.mockRestore();
  });
});

describe('접근성 상태', () => {
  it('TC-NAV-002 탭은 aria-selected 문자열 true/false를 가진다', async () => {
    await openMain('member');
    for (const tab of TABS) expect(tabButton(tab)).toHaveAttribute('aria-selected', tab === 'home' ? 'true' : 'false');
  });
});

describe('분석 (D-22)', () => {
  it('TC-ANL-005 홈, 전시, 기록, 설정 탭 진입마다 screen_view가 1회씩 나간다', async () => {
    const { h, path } = await openMain('member');
    await goTo('display', path);
    await goTo('record', path);
    await goTo('settings', path);
    expect(screenViews(h)).toEqual(['home', 'display', 'record', 'settings']);
  });

  it('TC-ANL-013 REQ-NAV-009 전시, 기록, 설정, 홈을 선택하면 bottom_navigation_selected가 1회씩 나간다', async () => {
    const { h, path } = await openMain('member');
    await goTo('display', path);
    await goTo('record', path);
    await goTo('settings', path);
    fireEvent.click(tabButton('home'));
    await screen.findByTestId('home.root');
    expect(tabEvents(h)).toEqual(['display', 'record', 'settings', 'home']);
  });

  it('TC-ANL-014 이미 선택된 탭을 다시 눌러도 선택마다 전송하지만 screen_view는 다시 나가지 않는다', async () => {
    const { h, path } = await openMain('member');
    await goTo('display', path);
    fireEvent.click(tabButton('display'));
    fireEvent.click(tabButton('display'));
    expect(tabEvents(h)).toEqual(['display', 'display', 'display']);
    expect(screenViews(h)).toEqual(['home', 'display']);
  });

  it('TC-ANL-015 REQ-NAV-009 업로드 버튼은 회원이든 게스트든 bottom_navigation_selected를 보내지 않는다', async () => {
    const member = await openMain('member');
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(tabEvents(member.h)).toEqual([]);
  });

  it('TC-ANL-015 게스트의 업로드 버튼도 이벤트를 보내지 않는다', async () => {
    const { h } = await openMain('guest');
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(h.tracker.events.filter((e) => e.name === 'bottom_navigation_selected')).toEqual([]);
  });

  it('TC-ANL-016 게스트 제한으로 막힌 기록 탭은 bottom_navigation_selected도 record screen_view도 보내지 않는다(임시안)', async () => {
    const { h } = await openMain('guest');
    fireEvent.click(tabButton('record'));
    expect(tabEvents(h)).toEqual([]);
    expect(screenViews(h)).toEqual(['home']);
  });

  it('TC-ANL-017 TC-NAV-044 브라우저 뒤로 가서 복귀한 홈은 screen_view를 다시 보내고 bottom_navigation_selected는 보내지 않는다', async () => {
    const { h, path, router } = await openMain('member');
    await goTo('display', path);
    await act(async () => router.navigate(-1));
    await screen.findByTestId('home.root');
    expect(screenViews(h)).toEqual(['home', 'display', 'home']);
    expect(tabEvents(h)).toEqual(['display']);
  });

  it('TC-ANL-018 탭 화면이 다시 그려져도 같은 화면 screen_view는 1회만 나간다', async () => {
    const { h, path } = await openMain('member');
    await goTo('display', path);
    fireEvent.click(screen.getByTestId('bottom-bar.upload-button'));
    expect(screenViews(h).filter((name) => name === 'display')).toHaveLength(1);
  });
});
