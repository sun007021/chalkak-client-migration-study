import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { BackHandler, Linking } from 'react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter, type RouteValue } from '../data/__testing__/FixtureRouter';
import { datedRoutes } from '../features/display/__testing__/createDisplayHarness';
import { GUEST_ROUTES, MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import {
  LIST_P1,
  NOTI_ROUTES,
} from '../features/notification/__testing__/createNotificationHarness';
import { MONTHS, RECORD_ROUTES } from '../features/record/__testing__/createRecordHarness';
import { SETTINGS_ROUTES } from '../features/settings/__testing__/createSettingsHarness';
import { UPLOAD_ROUTES } from '../features/upload/__testing__/createUploadHarness';
import { t } from '../shared/copy';
import { App } from './App';
import { AppContainer } from './AppContainer';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

type Mode = 'member' | 'guest' | 'none';

/** 홈·전시·기록·설정·알림·업로드 fixture를 모두 얹은 가짜 서버에 붙은 앱. 만들어진 컨테이너도 돌려준다. */
async function renderApp(mode: Mode, extra: Record<string, RouteValue> = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (mode === 'member') await net.signIn({ userId: 'user-a' });
  else if (mode === 'guest') await net.sessionStore.enterGuest();
  const router = new FixtureRouter(
    mode === 'guest'
      ? GUEST_ROUTES
      : {
          ...MEMBER_ROUTES,
          ...RECORD_ROUTES,
          ...SETTINGS_ROUTES,
          ...NOTI_ROUTES,
          ...UPLOAD_ROUTES,
          ...datedRoutes(['2026-10-20', '2026-10-26', '2026-10-27']),
          ...extra,
        },
  ).install(net.transport);
  const analytics = new FakeAnalyticsTracker();
  const create = jest.spyOn(AppContainer, 'create');
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
  const container = create.mock.results[0]?.value as AppContainer;
  return { net, router, analytics, container };
}

const TAB_IDS = ['home', 'display', 'record', 'settings'] as const;

async function pressTab(name: (typeof TAB_IDS)[number]) {
  await fireEvent.press(screen.getByTestId(`bottom-bar.tab-${name}`));
}

/** jest(ios)의 BackHandler는 이벤트를 내지 않으므로 등록된 핸들러를 안드로이드처럼 마지막 등록부터 호출한다. true면 앱이 처리했다. */
function captureBackHandlers() {
  type Handler = Parameters<typeof BackHandler.addEventListener>[1];
  const handlers: Handler[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return {
      remove: () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      },
    };
  });
  return async () => {
    let handled = false;
    for (const handler of [...handlers].reverse()) {
      if (handler(undefined as never)) {
        handled = true;
        break;
      }
    }
    await Promise.resolve();
    return handled;
  };
}

const rootRouteNames = (container: AppContainer): string[] =>
  (container.navigationHandle.getRootState()?.routes ?? []).map((route) => route.name);

afterEach(() => jest.restoreAllMocks());

describe('하단 바 구성과 선택 상태', () => {
  it('TC-NAV-001 하단 바는 홈, 전시, 가운데 업로드 버튼, 기록, 설정 순서의 5개 요소이고 탭 라벨은 홈/전시/기록/설정이다', async () => {
    await renderApp('member');
    const bar = await screen.findByTestId('bottom-bar.root');
    const ids = within(bar)
      .getAllByTestId(/^bottom-bar\./)
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'bottom-bar.tab-home',
      'bottom-bar.tab-display',
      'bottom-bar.upload-button',
      'bottom-bar.tab-record',
      'bottom-bar.tab-settings',
    ]);
    const labels = TAB_IDS.map(
      (name) => within(screen.getByTestId(`bottom-bar.tab-${name}`)).getByText(/.+/).props.children,
    );
    expect(labels).toEqual(['홈', '전시', '기록', '설정']);
  });

  it('TC-NAV-002 TC-NAV-003 첫 진입은 홈만 선택 상태이고 업로드 버튼은 선택 상태가 없다. 탭을 옮기면 선택 표시가 따라온다', async () => {
    await renderApp('member');
    await screen.findByTestId('bottom-bar.root');
    const selected = () =>
      TAB_IDS.filter(
        (n) => screen.getByTestId(`bottom-bar.tab-${n}`).props.accessibilityState?.selected,
      );
    expect(selected()).toEqual(['home']);
    expect(screen.getByTestId('bottom-bar.upload-button')).not.toBeSelected();
    await pressTab('settings');
    expect(selected()).toEqual(['settings']);
    expect(screen.getByTestId('bottom-bar.upload-button')).not.toBeSelected();
  });

  it('TC-NAV-004 홈에서 전시, 기록, 설정 탭을 차례로 누르면 각 화면이 열리고 선택 표시가 따라온다', async () => {
    await renderApp('member');
    await screen.findByTestId('home.root');
    const steps = [
      ['display', 'display.root'],
      ['record', 'record.root'],
      ['settings', 'settings.root'],
    ] as const;
    for (const [tab, root] of steps) {
      await pressTab(tab);
      expect(await screen.findByTestId(root)).toBeOnTheScreen();
      expect(screen.getByTestId(`bottom-bar.tab-${tab}`)).toBeSelected();
      expect(screen.getByTestId('bottom-bar.tab-home')).not.toBeSelected();
    }
  });

  it('TC-NAV-009 홈 탭을 다시 눌러도 화면 변화가 없다(재조회·새로 그리기 없음, 분석 이벤트만) - REQ-NAV-008 따름', async () => {
    const { router, analytics } = await renderApp('member');
    await screen.findByTestId('home.root');
    const before = router.calls('GET /posts/today').length;
    await pressTab('home');
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(screen.getByTestId('home.root')).toBeOnTheScreen();
    expect(router.calls('GET /posts/today')).toHaveLength(before);
    expect(analytics.events.filter((e) => e.name === 'bottom_navigation_selected')).toEqual([
      { name: 'bottom_navigation_selected', params: { destination: 'home' } },
    ]);
  });

  it('TC-NAV-010 전시의 정렬, 기록의 선택 날짜는 다른 탭에 다녀와도 유지된다', async () => {
    await renderApp('member');
    await screen.findByTestId('home.root');
    await pressTab('display');
    await fireEvent.press(await screen.findByTestId('display.sort-popular-tab'));
    await waitFor(() => expect(screen.getByTestId('display.sort-popular-tab')).toBeSelected());
    await pressTab('record');
    await fireEvent.press(await screen.findByTestId('record.day-2026-10-20'));
    expect(screen.getByTestId('record.day-2026-10-20')).toBeSelected();

    await pressTab('settings');
    await pressTab('display');
    expect(await screen.findByTestId('display.sort-popular-tab')).toBeSelected();
    await pressTab('record');
    expect(await screen.findByTestId('record.day-2026-10-20')).toBeSelected();
  });
});

describe('업로드 버튼 (회원)', () => {
  it('TC-NAV-005 업로드 버튼은 선택 탭을 바꾸지 않고 진입 게이트(GET /posts/today)를 호출한다', async () => {
    const { router, container } = await renderApp('member');
    await screen.findByTestId('home.root');
    await pressTab('settings');
    const before = router.calls('GET /posts/today').length;
    await fireEvent.press(screen.getByTestId('bottom-bar.upload-button'));
    await waitFor(() => expect(router.calls('GET /posts/today')).toHaveLength(before + 1));
    // 업로드 화면이 위에 쌓여도 탭 내비게이터의 선택은 설정 그대로다(업로드 버튼은 탭이 아니다).
    await screen.findByTestId('upload.root');
    const tabs = container.navigationHandle.getRootState()?.routes[0]?.state;
    expect(tabs?.routes[tabs.index ?? 0]?.name).toBe('Settings');
  });
});

describe('게스트 제한 (D-05)', () => {
  it('TC-NAV-016 게스트가 기록 탭을 누르면 토스트가 뜨고 탭 전환과 API 호출이 없다', async () => {
    const { net } = await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    const before = net.transport.requests.length;
    await pressTab('record');
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('nav.guest.record'));
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(net.transport.requests).toHaveLength(before);
  });

  it('TC-NAV-017 게스트가 업로드 버튼을 누르면 토스트가 뜨고 GET /posts/today 0건, 업로드 화면이 열리지 않는다', async () => {
    const { net } = await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    await fireEvent.press(screen.getByTestId('bottom-bar.upload-button'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('nav.guest.upload'));
    expect(net.transport.requests.filter((r) => r.url.includes('/posts/today'))).toHaveLength(0);
    expect(screen.queryByTestId('upload.root')).not.toBeOnTheScreen();
  });

  it('TC-NAV-020 게스트가 홈 알림 벨을 누르면 토스트가 뜨고 알림함이 열리지 않으며 알림 API가 없다', async () => {
    const { net, container } = await renderApp('guest');
    await fireEvent.press(await screen.findByTestId('home.notification-button'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      t('home.guest.notification'),
    );
    expect(rootRouteNames(container)).toEqual(['Tabs']);
    expect(net.transport.requests.filter((r) => r.url.includes('/notifications'))).toHaveLength(0);
  });

  it('TC-NAV-021 게스트 설정 탭은 로그인 버튼만 보이고 푸시 알림 설정·사인·로그아웃·회원탈퇴는 없다', async () => {
    await renderApp('guest');
    await screen.findByTestId('bottom-bar.root');
    await pressTab('settings');
    expect(await screen.findByTestId('settings.login-button')).toBeOnTheScreen();
    for (const id of [
      'settings.push-topic-toggle',
      'settings.signature-change-button',
      'settings.logout-row',
      'settings.withdraw-row',
    ]) {
      expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
    }
  });
});

describe('정지(BANNED) 회원 (D-08)', () => {
  it('TC-NAV-024 정지 회원도 기록, 알림, 설정, 전시가 열리고 조회 API가 정상 호출된다', async () => {
    const { net, router, container } = await renderApp('member', {
      'GET /posts/today': 'home/posts-today__403-banned',
    });
    await screen.findByTestId('home.root');
    await pressTab('record');
    expect(await screen.findByTestId('record.root')).toBeOnTheScreen();
    expect(router.calls(MONTHS)).toHaveLength(1);
    await pressTab('settings');
    expect(await screen.findByTestId('settings.root')).toBeOnTheScreen();
    expect(router.calls('GET /notification-settings')).toHaveLength(1);
    await pressTab('display');
    expect(await screen.findByTestId('display.root')).toBeOnTheScreen();
    expect(net.transport.requests.some((r) => /\/posts\?.*sort=recent/.test(r.url))).toBe(true);
    await pressTab('home');
    await fireEvent.press(await screen.findByTestId('home.notification-button'));
    await waitFor(() => expect(rootRouteNames(container)).toEqual(['Tabs', 'Notifications']));
    expect(await screen.findByTestId('notifications.root')).toBeOnTheScreen();
    await waitFor(() => expect(router.calls(LIST_P1)).toHaveLength(1));
  });
});

describe('딥링크 (REQ-NAV-034)', () => {
  it('TC-NAV-045 chalkak:// 와 https 링크로 열려도 어떤 화면 이동도 일어나지 않는다', async () => {
    const getInitialURL = jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('chalkak://record?date=2026-10-20');
    const addEventListener = jest.spyOn(Linking, 'addEventListener');
    const { container } = await renderApp('member');
    await screen.findByTestId('home.root');
    await act(async () => {
      for (const call of addEventListener.mock.calls) {
        if (call[0] === 'url')
          (call[1] as (e: { url: string }) => void)({ url: 'https://chalkak.app/display' });
      }
    });
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(rootRouteNames(container)).toEqual(['Tabs']);
    expect(container.navigationHandle.getRootState()?.routes[0]?.state?.index ?? 0).toBe(0);
    // 내비게이션 컨테이너가 URL 라우팅(linking)을 켜지 않으므로 초기 URL을 읽지도 않는다.
    expect(getInitialURL).not.toHaveBeenCalled();
  });
});

describe('로그인·로그아웃·재인증과 백스택', () => {
  it('TC-NAV-039 로그인 성공으로 홈에 들어오면 로그인 화면이 사라지고 뒤로가기가 로그인으로 돌아가지 않는다', async () => {
    const back = captureBackHandlers();
    const { net, container } = await renderApp('none');
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
    await net.signIn({ userId: 'user-a' });
    await act(async () => container.bootViewModel.toMain('member'));
    expect(await screen.findByTestId('bottom-bar.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('login.root')).not.toBeOnTheScreen();
    expect(rootRouteNames(container)).toEqual(['Tabs']);
    await back();
    expect(screen.queryByTestId('login.root')).not.toBeOnTheScreen();
  });

  it('TC-NAV-041 로그아웃으로 로그인 화면이 열린 뒤 뒤로가면 메인으로 돌아가지 못한다', async () => {
    const back = captureBackHandlers();
    await renderApp('member');
    await screen.findByTestId('home.root');
    await pressTab('settings');
    await fireEvent.press(await screen.findByTestId('settings.logout-row'));
    await fireEvent.press(screen.getByTestId('settings.logout-confirm-button'));
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
    await back();
    expect(screen.getByTestId('login.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeOnTheScreen();
  });

  it('TC-NAV-042 게시물 상세가 열린 채 REAUTHENTICATION_REQUIRED가 되면 로그인으로 가고 이전 화면이 백스택에 남지 않는다', async () => {
    const { net, container } = await renderApp('member');
    await screen.findByTestId('home.root');
    await act(async () => container.navigationHandle.navigate('Notifications'));
    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: 'p-1' }));
    expect(rootRouteNames(container)).toEqual(['Tabs', 'Notifications', 'PostDetail']);

    await act(async () => net.events.emit({ type: 'session-expired' }));
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('feed.root')).not.toBeOnTheScreen();

    // 다시 로그인해 메인에 들어오면 이전 화면들이 아니라 탭 루트 하나뿐이다.
    await net.signIn({ userId: 'user-a' });
    await act(async () => container.bootViewModel.toMain('member'));
    await screen.findByTestId('bottom-bar.root');
    expect(rootRouteNames(container)).toEqual(['Tabs']);
  });

  it('TC-NAV-050 계정 A에서 로그아웃 후 B로 로그인하면 홈이 선택되고 A의 정렬·선택 날짜가 남지 않는다', async () => {
    const { net, container } = await renderApp('member');
    await screen.findByTestId('home.root');
    await pressTab('display');
    await fireEvent.press(await screen.findByTestId('display.sort-popular-tab'));
    await waitFor(() => expect(screen.getByTestId('display.sort-popular-tab')).toBeSelected());
    await pressTab('record');
    await fireEvent.press(await screen.findByTestId('record.day-2026-10-20'));
    await pressTab('settings');
    await fireEvent.press(await screen.findByTestId('settings.logout-row'));
    await fireEvent.press(screen.getByTestId('settings.logout-confirm-button'));
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();

    await net.signIn({ userId: 'user-b' });
    await act(async () => container.bootViewModel.toMain('member'));
    expect(await screen.findByTestId('bottom-bar.tab-home')).toBeSelected();
    await pressTab('display');
    expect(await screen.findByTestId('display.sort-recent-tab')).toBeSelected();
    expect(screen.getByTestId('display.sort-popular-tab')).not.toBeSelected();
    await pressTab('record');
    expect(await screen.findByTestId('record.day-2026-10-20')).not.toBeSelected();
  });
});
