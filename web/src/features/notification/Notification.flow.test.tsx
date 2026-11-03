import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { noti, PAGE1, readKey, UNREAD_KEY } from '../../test/notificationHarness';
import { inboxLoaded, openNotifications, toastText } from '../../test/notificationScreens';
import { screenViews } from '../../test/screenViews';

vi.setConfig({ testTimeout: 15_000 });

const tid = (id: string) => screen.getByTestId(id);
const dotShown = () => screen.queryByTestId('home.notification-unread-dot') !== null;
const unreadCalls = (fixtures: { calls(key: string): unknown[] }) => fixtures.calls(UNREAD_KEY).length;

/** 홈에서 시작해 벨로 알림함을 연다. */
async function homeToInbox(options: Parameters<typeof openNotifications>[0] = {}) {
  const opened = await openNotifications({ ...options, path: '/home' });
  await screen.findByTestId('home.topic-title');
  fireEvent.click(tid('home.notification-button'));
  await inboxLoaded();
  return opened;
}

describe('홈 ↔ 알림함 ↔ 상세 흐름 (TC-NOTI-001, TC-NAV-030, TC-NAV-037)', () => {
  it('TC-NOTI-001 TC-NAV-030 홈 알림 벨을 누르면 알림함이 열리고 screen_view "notifications"가 1회 기록되며 뒤로 가면 홈이다', async () => {
    const { h, router } = await homeToInbox();
    expect(router.state.location.pathname).toBe('/notifications');
    expect(router.state.historyAction).toBe('PUSH');
    expect(screenViews(h.tracker).filter((name) => name === 'notifications')).toEqual(['notifications']);
    fireEvent.click(tid('notifications.back-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    await screen.findByTestId('home.root');
  });

  it('TC-NAV-037 알림 상세에서 뒤로 가면 알림함 목록으로 돌아오고, 상세의 "알림함으로"도 알림함이 하나만 쌓인 채 돌아온다', async () => {
    const { router, h } = await homeToInbox();
    fireEvent.click(tid(`notifications.item-${noti(2)}`)); // 반려
    await screen.findByTestId('notification-detail.title');
    expect(screenViews(h.tracker).filter((name) => name === 'notification_detail')).toEqual(['notification_detail']);
    fireEvent.click(tid('notification-detail.back-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
    await inboxLoaded();

    fireEvent.click(tid(`notifications.item-${noti(2)}`));
    await screen.findByTestId('notification-detail.back-to-inbox-button');
    fireEvent.click(tid('notification-detail.back-to-inbox-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
    await inboxLoaded();
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/home')); // 알림함이 두 번 쌓이지 않았다
  });

  it('TC-NOTI-028 알림함의 AI 알림에서 상세로 간 뒤 뒤로 오면 알림함이 그대로다(홈 "자세히 보기"와 같은 openAiReview 계약)', async () => {
    const { router } = await homeToInbox();
    fireEvent.click(tid(`notifications.item-${noti(3)}`));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/feed\//));
    expect((router.state.location.state as { openAiReview?: boolean } | null)?.openAiReview).toBe(true);
    await screen.findByTestId('feed.root');
    await act(async () => {
      await router.navigate(-1);
    });
    await inboxLoaded();
    expect(router.state.location.pathname).toBe('/notifications');
  });
});

describe('미읽음 점 (TC-NOTI-049, 050, 052, 053, 054, 055, REQ-NOTI-028~032)', () => {
  it('TC-NOTI-049 TC-NOTI-054 읽음 처리 뒤 홈으로 돌아오면 미읽음이 다시 조회되어 점이 사라진다', async () => {
    const opened = await openNotifications({ path: '/home', server: { unread: true } });
    const server = opened.server;
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(dotShown()).toBe(true)); // hasUnread=true
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    fireEvent.click(tid(`notifications.item-${noti(1)}`));
    await screen.findByTestId('feed.root');
    expect(server.unread).toBe(false);
    await act(async () => {
      await opened.router.navigate(-2); // 상세 → 알림함 → 홈
    });
    await screen.findByTestId('home.root');
    await waitFor(() => expect(dotShown()).toBe(false));
  });

  it('TC-NOTI-050 읽음 요청이 성공하면 미읽음을 한 번 다시 조회하고, 알림함에서 홈으로 돌아오면 또 한 번 조회한다', async () => {
    const opened = await openNotifications({ path: '/home', server: { unread: true } });
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(unreadCalls(opened.fixtures)).toBe(1));
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    expect(unreadCalls(opened.fixtures)).toBe(1);
    fireEvent.click(tid(`notifications.item-${noti(1)}`));
    await screen.findByTestId('feed.root');
    await waitFor(() => expect(unreadCalls(opened.fixtures)).toBe(2)); // 읽음 성공 직후
    await act(async () => {
      await opened.router.navigate(-2);
    });
    await screen.findByTestId('home.root');
    await waitFor(() => expect(unreadCalls(opened.fixtures)).toBe(3)); // 알림함에서 돌아옴
  });

  it('TC-NOTI-050 연결 실패로 읽음 저장이 안 되면 미읽음 점은 다시 조회하지 않는다', async () => {
    const opened = await openNotifications({
      path: '/home',
      routes: {
        [readKey(1)]: () => {
          throw new TypeError('Failed to fetch');
        },
      },
    });
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(unreadCalls(opened.fixtures)).toBe(1));
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    fireEvent.click(tid(`notifications.item-${noti(1)}`));
    await act(async () => {
      await opened.h.clock.advance(3_000);
    });
    await screen.findByTestId('feed.root');
    expect(unreadCalls(opened.fixtures)).toBe(1);
  });

  it('TC-NOTI-052 읽음 뒤 미읽음 조회가 실패하면 이전 점 상태를 유지하고 토스트·오류 UI가 없다', async () => {
    const opened = await openNotifications({ path: '/home', server: { unread: true } });
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(dotShown()).toBe(true));
    opened.fixtures.set(UNREAD_KEY, 'notification/unread-status__internal-error');
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    fireEvent.click(tid(`notifications.item-${noti(1)}`));
    await screen.findByTestId('feed.root');
    await act(async () => {
      await opened.h.clock.advance(3_000);
      await opened.router.navigate(-2);
    });
    await screen.findByTestId('home.root');
    await act(async () => {
      await opened.h.clock.advance(3_000);
    });
    expect(dotShown()).toBe(true);
    expect(toastText()).toBeNull();
  });

  it('TC-NOTI-055 읽음 뒤 미읽음 조회가 401이고 refresh가 REAUTHENTICATION_REQUIRED면 로그인 화면으로 간다', async () => {
    const opened = await openNotifications({ path: '/home', server: { unread: true } });
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(unreadCalls(opened.fixtures)).toBe(1));
    opened.fixtures.set(UNREAD_KEY, 'notification/unread-status__unauthorized');
    opened.fixtures.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    fireEvent.click(tid(`notifications.item-${noti(1)}`));
    await waitFor(() => expect(opened.router.state.location.pathname).toBe('/login'));
  });

  it('TC-NOTI-053 로그아웃·계정 전환(userCaches)이면 알림함 목록이 비워지고 홈의 미읽음 점 상태도 사라진다', async () => {
    const opened = await homeToInbox({ routes: { [UNREAD_KEY]: () => json(200, { hasUnread: true }) } });
    const { viewModel } = opened.h.container.inboxSession();
    const home = opened.h.container.homeSession('member').viewModel;
    expect(viewModel.state.body.status).toBe('ready');
    expect(home.state.hasUnread).toBe(true);
    // 알림함이 붙어 있으면 초기화 직후 다시 읽는다. 새 계정의 응답이 오기 전까지는 이전 계정 목록 없이 loading이다.
    const gate = deferred<void>();
    opened.fixtures.set(PAGE1, gated(gate, 'notification/notifications__page1'));
    await act(async () => {
      await opened.h.container.userCaches.clearAll();
    });
    expect(viewModel.state.body).toEqual({ status: 'loading' });
    expect(home.state.hasUnread).toBe(false);
    await act(async () => gate.resolve());
    await inboxLoaded();
  });

  it('TC-NOTI-049 미읽음이 false면 점이 없고 true면 점이 있다(알림함을 다녀온 뒤에도 서버 값을 따른다)', async () => {
    const opened = await openNotifications({ path: '/home', routes: { [UNREAD_KEY]: () => json(200, { hasUnread: true }) } });
    await screen.findByTestId('home.topic-title');
    await waitFor(() => expect(dotShown()).toBe(true));
    fireEvent.click(tid('home.notification-button'));
    await inboxLoaded();
    opened.fixtures.set(UNREAD_KEY, () => json(200, { hasUnread: false }));
    fireEvent.click(tid('notifications.back-button'));
    await screen.findByTestId('home.root');
    await waitFor(() => expect(dotShown()).toBe(false));
  });
});

describe('Web은 푸시를 받지 않는다 (TC-PUSH-036, REQ-PUSH-017, Q-04)', () => {
  it('TC-PUSH-036 로그인 상태로 홈과 알림함을 쓰는 동안 PUT /push-devices/current 호출·서비스 워커 등록·알림 권한 요청이 0건이다', async () => {
    const register = vi.fn();
    const requestPermission = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register, getRegistration: vi.fn() } });
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    try {
      const opened = await homeToInbox();
      fireEvent.click(tid(`notifications.item-${noti(1)}`));
      await screen.findByTestId('feed.root');
      expect(opened.h.ff.calls.filter((c) => c.path.startsWith('/push-devices'))).toHaveLength(0);
      expect(register).not.toHaveBeenCalled();
      expect(requestPermission).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });
});
